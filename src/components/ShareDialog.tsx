import { useEffect, useState } from 'react'
import { Copy, Loader2, Link2Off, QrCode, Crown, Download } from 'lucide-react'
import { useEvent } from '../store/event'
import { useUI } from '../store/ui'
import { useAccount, gate } from '../store/account'
import { createCloudShare, currentShareToken, download, revokeCloudShare, shareHash, slug } from '../lib/share'
import { Button, Modal, toast } from './ui'

export default function ShareDialog() {
  const d = useEvent((s) => s.doc)!
  const { isPro, user, cloud: cloudConfigured } = useAccount()
  const close = () => useUI.getState().set({ shareOpen: false })
  const [url, setUrl] = useState<string | null>(null)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const cloud = cloudConfigured && !!user

  useEffect(() => {
    if (!isPro) return
    ;(async () => {
      if (cloud) {
        const t = await currentShareToken(d.id)
        setUrl(t ? `${location.origin}/?s=${t}` : null)
      } else {
        setUrl(`${location.origin}/${shareHash(d)}`)
      }
    })()
  }, [isPro, cloud, d])

  useEffect(() => {
    if (!url) return setQr('')
    import('qrcode').then((Q) => Q.toDataURL(url, { margin: 1, width: 400 })).then(setQr, () => setQr(''))
  }, [url])

  const create = async () => {
    if (!gate('share')) return
    setBusy(true)
    try {
      // Make sure the latest version is in the cloud before handing out a link.
      const { storage } = await import('../store/persistence')
      await storage().saveEvent(useEvent.getState().doc!)
      setUrl(`${location.origin}/?s=${await createCloudShare(d)}`)
    } catch {
      toast('Could not create link')
    }
    setBusy(false)
  }

  return (
    <Modal open onClose={close} title="Share this plan" width="max-w-md">
      {!isPro ? (
        <div className="text-center">
          <p className="text-sm text-slate-600">Send clients and crew a view-only link that always shows the latest plan — floor plan, run sheet, forms and all. Crew can fill in forms from it, no login.</p>
          <Button variant="primary" className="mt-4" onClick={() => gate('share')}>
            <Crown size={16} /> Unlock sharing
          </Button>
          <p className="mt-3 text-xs text-slate-500">
            Or{' '}
            <button className="text-brand-600 underline" onClick={() => useUI.getState().set({ shareOpen: false, exportOpen: true })}>
              export a PDF
            </button>{' '}
            to send by email.
          </p>
        </div>
      ) : !cloud && cloudConfigured ? (
        <div className="text-center text-sm text-slate-600">
          Sign in to create live links.
          <Button variant="primary" className="mt-3" onClick={() => useAccount.getState().setSignIn(true)}>
            Sign in
          </Button>
        </div>
      ) : url ? (
        <div>
          <p className="mb-2 text-sm text-slate-600">{cloud ? 'Anyone with this link can view the plan. It updates as you edit.' : 'A snapshot link — it contains the plan as it is now. Photos and signatures are left out.'}</p>
          <div className="flex gap-2">
            <input className="input text-xs" readOnly value={url} onFocus={(e) => e.target.select()} />
            <Button
              variant="primary"
              onClick={() => {
                navigator.clipboard.writeText(url)
                toast('Link copied')
              }}
            >
              <Copy size={16} />
            </Button>
          </div>
          {qr && (
            <div className="mt-4 flex items-center gap-4">
              <img src={qr} alt="QR code" className="w-32 rounded-lg border border-slate-200" />
              <div className="text-sm text-slate-600">
                <p className="flex items-center gap-1 font-medium">
                  <QrCode size={14} /> For the venue wall
                </p>
                <p className="mt-1 text-xs">Crew scan it to see the floor plan and run sheet on their phone.</p>
                <Button size="sm" className="mt-2" onClick={() => fetch(qr).then((r) => r.blob()).then((b) => download(b, `${slug(d.name)}-qr.png`))}>
                  <Download size={14} /> QR code
                </Button>
              </div>
            </div>
          )}
          {cloud && (
            <button
              className="mt-4 flex items-center gap-1 text-xs text-red-600 hover:underline"
              onClick={async () => {
                await revokeCloudShare(d.id)
                setUrl(null)
                toast('Link turned off')
              }}
            >
              <Link2Off size={12} /> Turn off link
            </button>
          )}
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-slate-600">Create a view-only link for clients and crew. It always shows the latest version.</p>
          <Button variant="primary" className="mt-4" onClick={create} disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />} Create link
          </Button>
        </div>
      )}
    </Modal>
  )
}
