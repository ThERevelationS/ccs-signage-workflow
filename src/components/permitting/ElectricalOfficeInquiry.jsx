import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { buildElectricalOfficeInquiry } from './electricalOfficeInquiry.mjs';

export default function ElectricalOfficeInquiry({ research, role }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const area = useRef(null);
  const inquiry = buildElectricalOfficeInquiry(research, role);
  const currentText = useRef(inquiry.text);
  currentText.current = inquiry.text;
  const label = role === 'electrical_permit' ? 'permit issuer' : 'inspection provider';
  const id = 'electrical-inquiry-' + role;
  useEffect(() => { setStatus(''); }, [inquiry.text]);
  const select = () => { area.current?.focus(); area.current?.select(); };
  const copy = async () => {
    const text = inquiry.text;
    setStatus('');
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (currentText.current === text) setStatus('Inquiry copied. Add the project details and review it before contacting the office.');
    } catch {
      if (currentText.current === text) {
        select();
        setStatus('Copy is unavailable. The inquiry is selected; use your device’s Copy command.');
      }
    } finally { setCopying(false); }
  };
  if (!inquiry.available) return <p className="text-xs">{inquiry.reason}</p>;
  return <section aria-label={'Office inquiry: ' + role} className="space-y-2 border-t pt-3">
    <Button type="button" variant="outline" className="min-h-11 h-auto w-full whitespace-normal"
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      {open ? 'Hide' : 'Prepare'} {label} inquiry
    </Button>
    {open && <div id={id} className="space-y-2">
      <label htmlFor={id + '-text'} className="block font-semibold">Questions for the {label}</label>
      <p>Add the exact project address and proposed work after copying. Saved findings remain unverified. Nothing is sent or saved by this tool.</p>
      <Textarea id={id + '-text'} ref={area} readOnly value={inquiry.text} rows={12}
        className="w-full min-w-0 text-xs" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={copying} onClick={copy}>
          {copying ? 'Copying…' : 'Copy inquiry'}
        </Button>
        <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={select}>Select inquiry text</Button>
      </div>
      {status && <p role="status">{status}</p>}
    </div>}
  </section>;
}
