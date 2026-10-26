import type { PoolClient } from "pg";
import pool, { query } from "@/lib/db/pool";
import { insertAuditEntry } from "@/lib/db/audit";
import type { z } from "zod";
import type { templateSaveSchema, itemsSaveSchema, outcomeSaveSchema, cycleSaveSchema, cycleCreateSchema } from "@/lib/validations/kpi-config.schema";

// KPI appraisal configuration: cycles, role templates (KRA lines), HR/bonus
// items and score outcome bands. All of it is data edited by the HOD; the
// scoring code reads it and holds no weights of its own.

export interface CycleSummary {
  id: string;
  cycleCode: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: "Draft" | "Open" | "Closed";
}

export async function listCycles(): Promise<CycleSummary[]> {
  const res = await query<CycleSummary>(
    `SELECT id, cyclecode AS "cycleCode", name,
            to_char(periodstart, 'YYYY-MM-DD') AS "periodStart",
            to_char(periodend, 'YYYY-MM-DD') AS "periodEnd", status
     FROM kpi_cycle ORDER BY periodstart DESC`
  );
  return res.rows;
}

export async function getCycleConfig(cycleId: string) {
  const cycleRes = await query(
    `SELECT id, cyclecode AS "cycleCode", name,
            to_char(periodstart, 'YYYY-MM-DD') AS "periodStart",
            to_char(periodend, 'YYYY-MM-DD') AS "periodEnd", status, config
     FROM kpi_cycle WHERE id = $1`,
    [cycleId]
  );
  if (cycleRes.rows.length === 0) return null;

  const [templates, lines, items, outcomes] = await Promise.all([
    query(
      `SELECT t.id, t.displayname AS "displayName", r.rolecode AS "roleCode", r.rolename AS "roleName"
       FROM kpi_template t JOIN role r ON r.id = t.roleid
       WHERE t.cycleid = $1 ORDER BY t.sortorder, r.rolename`,
      [cycleId]
    ),
    query(
      `SELECT l.id, l.templateid AS "templateId", l.lineno AS "lineNo", l.name, l.measurement, l.target,
              l.explanation, l.weight::float AS weight, l.evidencerequired AS "evidenceRequired",
              l.autometric AS "autoMetric", l.bands
       FROM kpi_template_line l JOIN kpi_template t ON t.id = l.templateid
       WHERE t.cycleid = $1 ORDER BY l.templateid, l.lineno`,
      [cycleId]
    ),
    query(
      `SELECT id, itemno AS "itemNo", section, name, description, weight::float AS weight,
              scalemax AS "scaleMax", inputmode AS "inputMode", bands
       FROM kpi_item WHERE cycleid = $1 ORDER BY itemno`,
      [cycleId]
    ),
    query(
      `SELECT minscore::float AS "minScore", outcome FROM kpi_outcome_band WHERE cycleid = $1 ORDER BY minscore`,
      [cycleId]
    ),
  ]);

  return {
    cycle: cycleRes.rows[0],
    templates: templates.rows.map((t) => ({
      ...t,
      lines: lines.rows.filter((l) => l.templateId === t.id),
    })),
    items: items.rows,
    outcomeBands: outcomes.rows,
  };
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Once any appraisal in the cycle is finalised, the criteria behind it are
// frozen so a finished result can never be re-scored by editing a weight.
async function cycleIsLocked(client: PoolClient, cycleId: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM kpi_appraisal WHERE cycleid = $1 AND status IN ('Finalised','SentToHR') LIMIT 1`, [cycleId]);
  return res.rows.length > 0;
}

const brief = (rows: { name: string; weight: number }[]) =>
  rows.map((r) => `${r.name}=${r.weight}`).join("; ").slice(0, 3000);

export async function saveTemplate(
  cycleId: string,
  templateId: string,
  input: z.infer<typeof templateSaveSchema>,
  staffId: string
): Promise<"saved" | "not_found" | "locked"> {
  return inTransaction(async (client) => {
    const found = await client.query(`SELECT 1 FROM kpi_template WHERE id = $1 AND cycleid = $2`, [templateId, cycleId]);
    if (found.rows.length === 0) return "not_found";
    if (await cycleIsLocked(client, cycleId)) return "locked";

    const before = await client.query<{ id: string; name: string; weight: string }>(
      `SELECT id, name, weight FROM kpi_template_line WHERE templateid = $1 ORDER BY lineno`,
      [templateId]
    );
    await client.query(`UPDATE kpi_template SET displayname = $2, updatedat = now() WHERE id = $1`, [templateId, input.displayName]);

    // Park every existing line out of the way so renumbering can't hit the
    // (template, line no) unique constraint part-way through.
    await client.query(`UPDATE kpi_template_line SET lineno = lineno + 1000 WHERE templateid = $1`, [templateId]);

    const keep: string[] = [];
    for (let i = 0; i < input.lines.length; i++) {
      const l = input.lines[i];
      const params = [
        i + 1, l.name, l.measurement ?? null, l.target ?? null, l.explanation ?? null, l.weight,
        l.evidenceRequired, l.autoMetric ?? null, JSON.stringify(l.bands),
      ];
      if (l.id) {
        const upd = await client.query(
          `UPDATE kpi_template_line
           SET lineno = $1, name = $2, measurement = $3, target = $4, explanation = $5, weight = $6,
               evidencerequired = $7, autometric = $8, bands = $9::jsonb, updatedat = now()
           WHERE id = $10 AND templateid = $11 RETURNING id`,
          [...params, l.id, templateId]
        );
        if (upd.rows.length === 0) throw new Error("Line does not belong to this template");
        keep.push(l.id);
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO kpi_template_line
             (templateid, lineno, name, measurement, target, explanation, weight, evidencerequired, autometric, bands)
           VALUES ($10, $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING id`,
          [...params, templateId]
        );
        keep.push(ins.rows[0].id);
      }
    }
    // Lines left out of the payload were removed in the editor.
    await client.query(`DELETE FROM kpi_template_line WHERE templateid = $1 AND NOT (id = ANY($2::uuid[]))`, [templateId, keep]);

    await insertAuditEntry(
      {
        entityName: "KPI_TEMPLATE", entityId: templateId, action: "Update", fieldName: "KRA lines",
        oldValue: brief(before.rows.map((r) => ({ name: r.name, weight: Number(r.weight) }))),
        newValue: brief(input.lines), performedBy: staffId,
      },
      client
    );
    return "saved";
  });
}

export async function saveItems(cycleId: string, input: z.infer<typeof itemsSaveSchema>, staffId: string): Promise<"saved" | "not_found" | "locked"> {
  return inTransaction(async (client) => {
    const found = await client.query(`SELECT 1 FROM kpi_cycle WHERE id = $1`, [cycleId]);
    if (found.rows.length === 0) return "not_found";
    if (await cycleIsLocked(client, cycleId)) return "locked";

    const before = await client.query<{ name: string; weight: string }>(`SELECT name, weight FROM kpi_item WHERE cycleid = $1 ORDER BY itemno`, [cycleId]);
    await client.query(`UPDATE kpi_item SET itemno = itemno + 1000 WHERE cycleid = $1`, [cycleId]);

    const keep: string[] = [];
    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      const params = [i + 1, it.section, it.name, it.description ?? null, it.weight, it.scaleMax, it.inputMode, JSON.stringify(it.bands)];
      if (it.id) {
        const upd = await client.query(
          `UPDATE kpi_item SET itemno = $1, section = $2, name = $3, description = $4, weight = $5, scalemax = $6,
                  inputmode = $7, bands = $8::jsonb, updatedat = now()
           WHERE id = $9 AND cycleid = $10 RETURNING id`,
          [...params, it.id, cycleId]
        );
        if (upd.rows.length === 0) throw new Error("Item does not belong to this cycle");
        keep.push(it.id);
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO kpi_item (cycleid, itemno, section, name, description, weight, scalemax, inputmode, bands)
           VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
          [...params, cycleId]
        );
        keep.push(ins.rows[0].id);
      }
    }
    await client.query(`DELETE FROM kpi_item WHERE cycleid = $1 AND NOT (id = ANY($2::uuid[]))`, [cycleId, keep]);

    await insertAuditEntry(
      {
        entityName: "KPI_CYCLE", entityId: cycleId, action: "Update", fieldName: "HR and bonus items",
        oldValue: brief(before.rows.map((r) => ({ name: r.name, weight: Number(r.weight) }))),
        newValue: brief(input.items), performedBy: staffId,
      },
      client
    );
    return "saved";
  });
}

export async function saveOutcomeBands(cycleId: string, input: z.infer<typeof outcomeSaveSchema>, staffId: string): Promise<"saved" | "not_found" | "locked"> {
  return inTransaction(async (client) => {
    const found = await client.query(`SELECT 1 FROM kpi_cycle WHERE id = $1`, [cycleId]);
    if (found.rows.length === 0) return "not_found";
    if (await cycleIsLocked(client, cycleId)) return "locked";

    const before = await client.query<{ minscore: string; outcome: string }>(
      `SELECT minscore, outcome FROM kpi_outcome_band WHERE cycleid = $1 ORDER BY minscore`, [cycleId]
    );
    await client.query(`DELETE FROM kpi_outcome_band WHERE cycleid = $1`, [cycleId]);
    for (const b of input.bands) {
      await client.query(`INSERT INTO kpi_outcome_band (cycleid, minscore, outcome) VALUES ($1, $2, $3)`, [cycleId, b.minScore, b.outcome]);
    }
    await insertAuditEntry(
      {
        entityName: "KPI_CYCLE", entityId: cycleId, action: "Update", fieldName: "Score outcome bands",
        oldValue: before.rows.map((r) => `${r.minscore}: ${r.outcome}`).join("; ").slice(0, 3000),
        newValue: input.bands.map((b) => `${b.minScore}: ${b.outcome}`).join("; ").slice(0, 3000),
        performedBy: staffId,
      },
      client
    );
    return "saved";
  });
}

export async function updateCycle(cycleId: string, input: z.infer<typeof cycleSaveSchema>, staffId: string): Promise<"saved" | "not_found"> {
  return inTransaction(async (client) => {
    const cur = await client.query(`SELECT name, status, config FROM kpi_cycle WHERE id = $1 FOR UPDATE`, [cycleId]);
    if (cur.rows.length === 0) return "not_found";
    const config = { ...(cur.rows[0].config ?? {}) };
    if (input.certificates) config.certificates = input.certificates;
    if (input.hrEmails) config.hrEmails = [...new Set(input.hrEmails)];

    await client.query(
      `UPDATE kpi_cycle SET name = COALESCE($2, name), status = COALESCE($3, status),
              periodstart = COALESCE($4::date, periodstart), periodend = COALESCE($5::date, periodend),
              config = $6::jsonb, updatedat = now()
       WHERE id = $1`,
      [cycleId, input.name ?? null, input.status ?? null, input.periodStart ?? null, input.periodEnd ?? null, JSON.stringify(config)]
    );
    await insertAuditEntry(
      {
        entityName: "KPI_CYCLE", entityId: cycleId, action: input.status && input.status !== cur.rows[0].status ? "StatusChange" : "Update",
        fieldName: "Cycle settings", oldValue: `${cur.rows[0].name} (${cur.rows[0].status})`,
        newValue: JSON.stringify(input).slice(0, 3000), performedBy: staffId,
      },
      client
    );
    return "saved";
  });
}

/**
 * Starts a new cycle as a copy of an existing one: the role templates and their
 * lines, the HR and bonus items, the outcome bands and the cycle settings. The
 * copy starts in Draft with no appraisals, so it can be edited freely before it
 * is opened (the earlier cycle is not touched).
 */
export async function createCycleCopy(
  input: z.infer<typeof cycleCreateSchema>,
  staffId: string
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  return inTransaction(async (client) => {
    const src = await client.query<{ config: Record<string, unknown> }>(`SELECT config FROM kpi_cycle WHERE id = $1`, [input.copyFromId]);
    if (src.rows.length === 0) return { ok: false as const, message: "The cycle to copy was not found" };

    // A short unique code from the start date, e.g. 2026-07, then 2026-07-2 ...
    const base = input.periodStart.slice(0, 7);
    let code = base;
    for (let n = 2; (await client.query(`SELECT 1 FROM kpi_cycle WHERE cyclecode = $1`, [code])).rows.length > 0; n++) code = `${base}-${n}`;

    const cycle = await client.query<{ id: string }>(
      `INSERT INTO kpi_cycle (cyclecode, name, periodstart, periodend, status, config)
       VALUES ($1, $2, $3, $4, 'Draft', $5::jsonb) RETURNING id`,
      [code, input.name.trim(), input.periodStart, input.periodEnd, JSON.stringify(src.rows[0].config ?? {})]
    );
    const id = cycle.rows[0].id;

    const templates = await client.query<{ id: string; roleid: string; displayname: string; sortorder: number }>(
      `SELECT id, roleid, displayname, sortorder FROM kpi_template WHERE cycleid = $1`, [input.copyFromId]);
    for (const t of templates.rows) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO kpi_template (cycleid, roleid, displayname, sortorder) VALUES ($1, $2, $3, $4) RETURNING id`,
        [id, t.roleid, t.displayname, t.sortorder]);
      await client.query(
        `INSERT INTO kpi_template_line (templateid, lineno, name, measurement, target, explanation, weight, evidencerequired, autometric, bands)
         SELECT $1, lineno, name, measurement, target, explanation, weight, evidencerequired, autometric, bands
         FROM kpi_template_line WHERE templateid = $2`, [created.rows[0].id, t.id]);
    }
    await client.query(
      `INSERT INTO kpi_item (cycleid, itemno, section, name, description, weight, scalemax, inputmode, bands)
       SELECT $1, itemno, section, name, description, weight, scalemax, inputmode, bands FROM kpi_item WHERE cycleid = $2`, [id, input.copyFromId]);
    await client.query(
      `INSERT INTO kpi_outcome_band (cycleid, minscore, outcome) SELECT $1, minscore, outcome FROM kpi_outcome_band WHERE cycleid = $2`, [id, input.copyFromId]);

    await insertAuditEntry(
      { entityName: "KPI_CYCLE", entityId: id, action: "Insert", fieldName: "Cycle created", newValue: `${input.name.trim()} (copy of ${input.copyFromId})`, performedBy: staffId },
      client
    );
    return { ok: true as const, id };
  });
}
