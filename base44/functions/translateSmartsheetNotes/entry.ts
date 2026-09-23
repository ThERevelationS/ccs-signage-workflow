import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

const NOTE_TYPES = new Set(['admin', 'fabrication', 'vinyl', 'permitting', 'design', 'installation', 'client', 'other']);
const TYPE_LABELS: Record<string, string> = {
  'administrative work': 'admin',
  admin: 'admin',
  'sign shop fabrication': 'fabrication',
  fabrication: 'fabrication',
  'vinyl production': 'vinyl',
  vinyl: 'vinyl',
  'permitting steps': 'permitting',
  permitting: 'permitting',
  'design work': 'design',
  design: 'design',
  installation: 'installation',
  'client communication': 'client',
  client: 'client',
  other: 'other',
};
const HEADER = /^\[(\d{4}-\d{2}-\d{2}|undated)\s*\|\s*([^|\]]+)\s*\|\s*([^\]]*)\]\s*(.*)$/i;
const SUBTASK = /^\s*-\s*\[([xX ])\]\s*(.+)$/;

function clean(value: unknown, max = 4000) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function key(value: unknown) {
  return clean(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function noteType(value: unknown) {
  const normalized = key(value);
  return TYPE_LABELS[normalized] || (NOTE_TYPES.has(normalized) ? normalized : 'other');
}

function validDateOnly(value: unknown) {
  const raw = clean(value, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === raw ? raw : '';
}

function validTimestamp(value: unknown) {
  const raw = clean(value, 100);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function stableNumericId(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 8_000_000_000_000 + (hash >>> 0);
}

function parseCanonical(source: string) {
  if (!source) return [] as any[];
  const lines = source.split('\n');
  const notes: any[] = [];
  let current: any = null;
  const flush = () => {
    if (!current) return;
    current.text = clean(current.text);
    if (current.text) notes.push(current);
    current = null;
  };
  for (const line of lines) {
    const header = HEADER.exec(line);
    if (header) {
      flush();
      current = {
        date: header[1].toLowerCase() === 'undated' ? null : header[1],
        type: noteType(header[2]),
        created_by: clean(header[3], 320) || null,
        text: clean(header[4]),
        sub_tasks: [],
      };
      continue;
    }
    if (!current) {
      if (line.trim()) return [];
      continue;
    }
    const sub = SUBTASK.exec(line);
    if (sub) {
      current.sub_tasks.push({ text: clean(sub[2], 1000), completed: sub[1].toLowerCase() === 'x' });
    } else if (line.trim()) {
      current.text = current.text ? `${current.text}\n${line.trim()}` : line.trim();
    }
  }
  flush();
  return notes;
}

function normalizeAiNotes(raw: any) {
  const rows = Array.isArray(raw?.notes) ? raw.notes : [];
  return rows.slice(0, 100).map((row: any) => ({
    text: clean(row?.text),
    type: noteType(row?.type),
    date: validDateOnly(row?.date) || null,
    created_by: clean(row?.created_by, 320) || null,
    sub_tasks: (Array.isArray(row?.sub_tasks) ? row.sub_tasks : []).slice(0, 50).map((sub: any) => ({
      text: clean(sub?.text, 1000),
      completed: sub?.completed === true,
    })).filter((sub: any) => sub.text),
  })).filter((row: any) => row.text);
}

async function translateWithAi(base44: any, source: string) {
  const prompt = `Convert one Smartsheet Notes cell into separate Cincinnati Custom Signs Base44 work notes.

RULES:
- Preserve the source meaning. Do not invent facts.
- Split genuinely separate dated entries or separate note events into separate notes.
- If a date is explicitly present, return it as YYYY-MM-DD. If no date is explicit for that note, return null.
- If an author/person is explicitly stated, return that name. Otherwise return null.
- Choose exactly one note type from: admin, fabrication, vinyl, permitting, design, installation, client, other.
- Infer note type only from the note content; when uncertain use other.
- Preserve action items embedded under a note as sub_tasks when clearly applicable.
- Do not turn sales status words such as Lost, Closed, or Completed Sale into authoritative sales outcomes.
- Do not create or modify customers, users, tasks, stages, dates, or sales fields outside these notes.
- Return only the structured JSON requested.

SMARTSHEET NOTES:
${source}`;

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: false,
    response_json_schema: {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              type: { type: 'string', enum: [...NOTE_TYPES] },
              date: { type: ['string', 'null'] },
              created_by: { type: ['string', 'null'] },
              sub_tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    completed: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  return normalizeAiNotes(parsed);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor?.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
    }

    const source = clean(body?.notes_text);
    const sheetId = clean(body?.sheet_id, 40);
    const rowId = clean(body?.row_id, 40);
    const rowModifiedAt = validTimestamp(body?.row_modified_at);
    if (!source) {
      return Response.json({ success: true, method: 'blank', work_notes: [], audit: [] });
    }

    const canonical = parseCanonical(source);
    const parsed = canonical.length ? canonical : await translateWithAi(base44, source);
    if (!parsed.length) {
      return Response.json({
        success: false,
        error: 'Smartsheet Notes could not be separated safely. Manual review is required.',
      }, { status: 422 });
    }

    const workNotes = parsed.map((note: any, index: number) => {
      const explicitDate = validDateOnly(note.date);
      const timestamp = explicitDate
        ? `${explicitDate}T12:00:00.000Z`
        : rowModifiedAt || new Date().toISOString();
      const author = clean(note.created_by, 320)
        || (explicitDate ? 'Smartsheet Import' : 'Smartsheet Import (source date unavailable)');
      const id = stableNumericId(`${sheetId}|${rowId}|${index}|${timestamp}|${note.type}|${note.text}`);
      return {
        id,
        type: noteType(note.type),
        text: clean(note.text),
        timestamp,
        created_by: author,
        sub_tasks: (note.sub_tasks || []).map((sub: any, subIndex: number) => ({
          id: stableNumericId(`${sheetId}|${rowId}|${index}|${subIndex}|${sub.text}`),
          text: clean(sub.text, 1000),
          completed: sub.completed === true,
        })),
      };
    });

    return Response.json({
      success: true,
      read_only_translation: true,
      method: canonical.length ? 'canonical' : 'ai',
      work_notes: workNotes,
      audit: parsed.map((note: any, index: number) => ({
        note_index: index,
        explicit_source_date: validDateOnly(note.date) || null,
        timestamp_basis: validDateOnly(note.date) ? 'explicit_note_date' : rowModifiedAt ? 'smartsheet_row_modified_at' : 'translation_time',
        explicit_source_author: clean(note.created_by, 320) || null,
      })),
    });
  } catch (error) {
    console.error('translateSmartsheetNotes error:', error?.message || error);
    return Response.json({
      success: false,
      error: error?.message || 'Smartsheet Notes translation could not be completed safely.',
    }, { status: 500 });
  }
});
