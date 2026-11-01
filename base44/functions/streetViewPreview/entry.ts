import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

/**
 * Street View site preview for work orders / install locations.
 * Auth: staff session_token OR platform auth.
 * Body: { session_token?, address: string }
 * Returns: { available: boolean, image_data_url?, lat?, lng?, date?, pano_id? }
 * The API key never leaves the backend — the image is proxied as a data URL.
 */
const META = 'https://maps.googleapis.com/maps/api/streetview/metadata';
const IMG = 'https://maps.googleapis.com/maps/api/streetview';
const MAX_IMAGE_BYTES = 800 * 1024;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let user = await authenticateSignShopSession(base44, body?.session_token).catch(() => null);
    if (!user) user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const address = String(body?.address || '').trim().replace(/\s+/g, ' ').slice(0, 400);
    if (address.length < 6) return Response.json({ available: false, reason: 'address_too_short' });

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim()
      || Deno.env.get('GOOGLE_GEOCODING_API_KEY')?.trim();
    if (!apiKey) return Response.json({ error: 'Street View key not configured' }, { status: 503 });

    const metaResp = await fetch(`${META}?location=${encodeURIComponent(address)}&source=outdoor&key=${apiKey}`);
    const meta = await metaResp.json().catch(() => null);
    if (!metaResp.ok || !meta) {
      console.error('streetViewPreview metadata error', metaResp.status);
      return Response.json({ error: 'Street View unavailable' }, { status: 502 });
    }
    if (meta.status !== 'OK') {
      return Response.json({ available: false, reason: 'no_coverage' });
    }

    const loc = `${meta.location.lat},${meta.location.lng}`;
    const imgResp = await fetch(`${IMG}?location=${encodeURIComponent(loc)}&size=640x360&source=outdoor&fov=90&key=${apiKey}`);
    if (!imgResp.ok) {
      console.error('streetViewPreview image error', imgResp.status);
      return Response.json({ error: 'Street View image unavailable' }, { status: 502 });
    }
    const bytes = new Uint8Array(await imgResp.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return Response.json({ error: 'Street View image too large' }, { status: 502 });

    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return Response.json({
      available: true,
      image_data_url: `data:image/jpeg;base64,${btoa(binary)}`,
      lat: meta.location.lat,
      lng: meta.location.lng,
      date: meta.date || null,
      pano_id: meta.pano_id || null,
    });
  } catch (error) {
    console.error('streetViewPreview error:', error?.message || error);
    return Response.json({ error: 'Street View unavailable' }, { status: 500 });
  }
});
