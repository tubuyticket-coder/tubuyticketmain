const PROJECT_URL = 'https://uxhtnxixwusuwnudonyf.supabase.co';
const API_KEY = 'sb_publishable_hOnT2e5OCeaMHbDfaA1Q0g_vLKZnHvX';
const SITE_URL = 'https://www.tubuyticket.com';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] as string));

const page = (title: string, message: string, status = 404) => ({
  status,
  html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body><main><h1>${esc(title)}</h1><p>${esc(message)}</p><a href="/">Explore events on Tubuy Ticket</a></main></body></html>`,
});

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https://uxhtnxixwusuwnudonyf.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://uxhtnxixwusuwnudonyf.supabase.co; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method not allowed');
  }

  const slug = String(req.query?.slug || '').trim();
  if (!/^[a-z0-9-]{1,180}$/i.test(slug)) {
    const result = page('Event not found | Tubuy Ticket', 'This event link is invalid.');
    return res.status(result.status).send(req.method === 'HEAD' ? '' : result.html);
  }

  try {
    const headers = { apikey: API_KEY, Authorization: 'Bearer ' + API_KEY, Accept: 'application/json' };
    const eventUrl = new URL('/rest/v1/events', PROJECT_URL);
    eventUrl.searchParams.set('select', 'id,name,slug,description,category,cover_image_url,organizer_name,event_date,start_time,end_time,venue,town,county,location_description,status');
    eventUrl.searchParams.set('slug', 'eq.' + slug);
    eventUrl.searchParams.set('status', 'eq.published');
    eventUrl.searchParams.set('limit', '1');
    const eventResponse = await fetch(eventUrl.toString(), { headers });
    if (!eventResponse.ok) throw new Error('Event lookup failed: ' + eventResponse.status);
    const events = await eventResponse.json() as any[];
    const event = events[0];

    if (!event) {
      const result = page('Event not found | Tubuy Ticket', 'This event may have been unpublished or the link may have changed.');
      return res.status(result.status).send(req.method === 'HEAD' ? '' : result.html);
    }
    if (slug !== event.slug) {
      res.setHeader('Location', SITE_URL + '/events/' + encodeURIComponent(event.slug));
      return res.status(301).end();
    }

    const ticketUrl = new URL('/rest/v1/ticket_types', PROJECT_URL);
    ticketUrl.searchParams.set('select', 'id,name,description,price,is_enabled,is_sold_out,quantity_total,quantity_sold,quantity_reserved,sort_order');
    ticketUrl.searchParams.set('event_id', 'eq.' + event.id);
    ticketUrl.searchParams.set('is_enabled', 'eq.true');
    ticketUrl.searchParams.set('order', 'sort_order.asc');
    const ticketResponse = await fetch(ticketUrl.toString(), { headers });
    if (!ticketResponse.ok) throw new Error('Ticket lookup failed: ' + ticketResponse.status);
    const tickets = await ticketResponse.json() as any[];

    const canonical = SITE_URL + '/events/' + encodeURIComponent(event.slug);
    const title = event.name + ' Tickets | ' + (event.venue || event.town || 'Kenya') + ' – Tubuy Ticket';
    const description = ('Get tickets for ' + event.name + '. ' + (event.description || '') + ' ' + (event.venue || '') + ' ' + (event.town || '') + ' ' + (event.county || '')).replace(/\\s+/g, ' ').trim().slice(0, 300);
    const ticketHtml = tickets.map((ticket: any) => {
      const available = !ticket.is_sold_out && Number(ticket.quantity_total || 0) - Number(ticket.quantity_sold || 0) - Number(ticket.quantity_reserved || 0) > 0;
      return '<li><div><strong>' + esc(ticket.name) + '</strong>' + (ticket.description ? '<p>' + esc(ticket.description) + '</p>' : '') + '</div><b>KES ' + Number(ticket.price).toLocaleString('en-KE') + '</b><span class="' + (available ? 'available' : 'sold') + '">' + (available ? 'Available' : 'Sold out') + '</span></li>';
    }).join('');
    const image = event.cover_image_url ? '<img class="hero" src="' + esc(event.cover_image_url) + '" alt="' + esc(event.name) + '">' : '';
    const details = [event.event_date, event.start_time ? String(event.start_time).slice(0, 5) : '', event.venue, event.town, event.county].filter(Boolean).map(esc).join(' · ');
    const schema = {
      '@context': 'https://schema.org', '@type': 'Event', name: event.name,
      description: event.description || undefined,
      startDate: event.event_date + 'T' + (event.start_time || '00:00:00') + '+03:00',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      image: event.cover_image_url ? [event.cover_image_url] : undefined,
      location: { '@type': 'Place', name: event.venue || event.town || 'Kenya', address: { '@type': 'PostalAddress', addressLocality: event.town || undefined, addressRegion: event.county || undefined, addressCountry: 'KE' } },
      organizer: event.organizer_name ? { '@type': 'Organization', name: event.organizer_name } : undefined,
      offers: tickets.map((ticket: any) => ({ '@type': 'Offer', name: ticket.name, price: Number(ticket.price), priceCurrency: 'KES', availability: ticket.is_sold_out ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: canonical })),
    };
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:site_name" content="Tubuy Ticket"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">${event.cover_image_url ? '<meta property="og:image" content="' + esc(event.cover_image_url) + '">' : ''}<meta name="twitter:card" content="summary_large_image"><style>
*{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#17243b;font:16px/1.6 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{height:72px;background:#fff;border-bottom:1px solid #e8ebf1;display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100% - 1120px)/2))}.brand{display:flex;align-items:center;gap:10px;color:#17243b;text-decoration:none;font-weight:900}.brand small{display:block;font-size:10px;letter-spacing:.18em}.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#ff6a35;color:#101d35;font-size:23px}a{color:#34445f}.back{text-decoration:none;font-weight:650}main{max-width:1000px;margin:36px auto;padding:0 20px}article{background:#fff;border:1px solid #e8ebf1;border-radius:22px;overflow:hidden}.content{padding:clamp(22px,5vw,54px)}.hero{display:block;width:100%;max-height:460px;object-fit:cover;border-radius:16px;margin-bottom:28px}.eyebrow{color:#e65b2d;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(34px,6vw,56px);line-height:1.06;margin:10px 0 14px}.meta{color:#596981;font-weight:650}.description{white-space:pre-line;font-size:18px;color:#34445f;margin:28px 0}.location{color:#596981}section{margin:36px 0}ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;gap:18px;justify-content:space-between;padding:18px 0;border-bottom:1px solid #e8ebf1}li p{margin:3px 0;color:#68768b;font-size:14px}li span{font-size:12px}.available{color:#25804e}.sold{color:#b42318}.buy{display:inline-flex;background:#ff6a35;color:#101d35;text-decoration:none;font-weight:850;padding:15px 28px;border-radius:12px}.powered{font-size:13px;color:#78859a;margin-top:26px}@media(max-width:600px){main{margin:16px auto;padding:0 10px}header{padding:0 16px;height:64px}li{gap:8px;flex-wrap:wrap}}
</style></head><body><header><a class="brand" href="/"><span class="mark">T</span><span>TUBUY <small>TICKET</small></span></a><a class="back" href="/">Explore events</a></header><main><article><div class="content">${image}<p class="eyebrow">${esc(event.category || 'EVENT')}</p><h1>${esc(event.name)}</h1><p class="meta">${details}</p><p class="description">${esc(event.description || 'Discover event details and tickets on Tubuy Ticket.')}</p>${event.location_description ? '<p class="location">' + esc(event.location_description) + '</p>' : ''}<section><h2>Tickets</h2>${ticketHtml ? '<ul>' + ticketHtml + '</ul>' : '<p>Ticket options will be announced soon.</p>'}</section><a class="buy" href="/?event=${encodeURIComponent(event.id)}">Get tickets</a><p class="powered">Secure event discovery and ticketing by <a href="/">Tubuy Ticket</a></p></div></article></main><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></body></html>`;
    return res.status(200).send(req.method === 'HEAD' ? '' : html);
  } catch (error) {
    console.error('Vercel event page failed', error);
    const result = page('Event temporarily unavailable | Tubuy Ticket', 'Please try again shortly.', 503);
    return res.status(result.status).send(req.method === 'HEAD' ? '' : result.html);
  }
}
