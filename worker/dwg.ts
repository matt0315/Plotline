import { type AppEnv, HttpError, json, readJson, requirePro, requireUser } from './lib'

/**
 * DWG → DXF via CloudConvert. We never run a DWG parser ourselves:
 * the only open one (LibreDWG) is GPL v3, which can't ship in a closed product.
 * The browser uploads straight to CloudConvert, so big drawings never pass through the Worker.
 */
const API = 'https://api.cloudconvert.com/v2'

type Task = { name: string; status: string; result?: { form?: { url: string; parameters: Record<string, string> }; files?: { url: string }[] } }

const key = (env: AppEnv) => {
  if (!env.CLOUDCONVERT_API_KEY) throw new HttpError(503, 'DWG conversion is not configured — export DXF from your CAD app instead')
  return env.CLOUDCONVERT_API_KEY
}

export const startDwg = async (req: Request, env: AppEnv) => {
  const u = await requirePro(req, env)
  const { filename } = await readJson<{ filename?: string }>(req, 2000)
  const res = await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag: u.id,
      tasks: {
        upload: { operation: 'import/upload' },
        convert: { operation: 'convert', input: 'upload', input_format: 'dwg', output_format: 'dxf', filename: (filename || 'plan.dwg').replace(/\.dwg$/i, '.dxf') },
        export: { operation: 'export/url', input: 'convert' },
      },
    }),
  })
  const body = (await res.json()) as { data?: { id: string; tasks: Task[] }; message?: string }
  if (!res.ok || !body.data) throw new HttpError(502, body.message || 'Could not start conversion')
  const upload = body.data.tasks.find((t) => t.name === 'upload')?.result?.form
  if (!upload) throw new HttpError(502, 'Conversion service did not return an upload form')
  return json({ id: body.data.id, upload })
}

export const pollDwg = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  const id = new URL(req.url).searchParams.get('job')
  if (!id || !/^[\w-]+$/.test(id)) throw new HttpError(400, 'Missing job')
  const res = await fetch(`${API}/jobs/${id}`, { headers: { Authorization: `Bearer ${key(env)}` } })
  const body = (await res.json()) as { data?: { status: string; tag?: string; tasks: Task[] } }
  // Jobs are tagged with their owner; nobody else can read them.
  if (!res.ok || !body.data || body.data.tag !== u.id) throw new HttpError(404, 'Job not found')
  if (body.data.status === 'error') throw new HttpError(422, "That DWG couldn't be converted — try saving it as DXF from your CAD app")
  const file = body.data.tasks.find((t) => t.name === 'export' && t.status === 'finished')?.result?.files?.[0]
  if (!file) return new Response(null, { status: 202 })
  const dxf = await fetch(file.url)
  if (!dxf.ok) throw new HttpError(502, 'Could not fetch the converted file')
  return new Response(dxf.body, { headers: { 'Content-Type': 'application/dxf' } })
}
