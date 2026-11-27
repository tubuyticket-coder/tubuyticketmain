import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, Clock3, Compass,
  Headphones, ImagePlus, LogIn, LogOut, Mail, MapPin, Menu, MessageCircle,
  Minus, Plus, Search, ScanLine, ShieldCheck, Share2, Download, Ban, ExternalLink, Ticket, User, Users, Wallet, X, Trash2, Pencil
} from 'lucide-react';
import { supabase, type EventRecord, type TicketType } from './lib/supabase';
import TicketCard from './components/TicketCard';
import TicketScanner from './components/TicketScanner';
import { waitForEventFunction } from './lib/eventFunction';

const PHONE = '0716625790';
const EMAIL = 'tubuyticket@gmail.com';
const WHATSAPP = 'https://wa.me/254716625790';
const CATEGORIES = ['Music & Nightlife','Community','Arts & Culture','Business','Sports','Food & Drink','Education','Other'];

type Profile = { id:string; full_name:string; email:string|null; phone:string|null };
type Organizer = { id:string; user_id:string; organization_name:string|null; bio:string|null; website:string|null; verification_status:string; payment_method_type:string|null; payment_mobile_number:string|null; payment_till_number:string|null; payment_account_name:string|null; verification_notes:string|null };
type Booking = { id:string; booking_reference:string; event_id:string; total_amount:number; currency:string; booking_status:string; created_at:string };
type TicketDraft = { id?:string; name:string; description:string; price:string; quantity:string; max_per_customer:string; sales_start:string; sales_end:string };
const emptyTicket = ():TicketDraft => ({name:'Regular',description:'',price:'',quantity:'100',max_per_customer:'10',sales_start:'',sales_end:''});
const toDateTimeLocal = (value:string|null|undefined) => value ? new Date(value).toISOString().slice(0,16) : '';
const emptyEvent = () => ({name:'',description:'',category:'Music & Nightlife',event_date:'',start_time:'18:00',end_time:'',venue:'',town:'',county:'',contact_email:'',contact_phone:'',location_description:'',terms:''});
const money = (n:number|string) => new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(Number(n||0));
const dateLabel = (v:string) => v ? new Date(v+'T12:00:00').toLocaleDateString('en-KE',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) : '';
const readableDate = (value:string|null|undefined) => value ? new Date(value).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'}) : 'Not specified';
const ticketIsOnSale = (ticket:TicketType) => (!ticket.sales_start || Date.now() >= new Date(ticket.sales_start).getTime()) && (!ticket.sales_end || Date.now() <= new Date(ticket.sales_end).getTime());
const ticketSaleLabel = (ticket:TicketType) => ticket.sales_start && Date.now() < new Date(ticket.sales_start).getTime() ? 'Sales open '+new Date(ticket.sales_start).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'}) : ticket.sales_end && Date.now() > new Date(ticket.sales_end).getTime() ? 'Sales closed' : 'On sale now';
const slugify = (s:string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const shortTime = (s:string) => s?.slice(0,5) || '';

function Brand({light=false}:{light?:boolean}) {
  return <span className={'brand '+(light?'brand-light':'')}><svg viewBox="0 0 44 44" aria-hidden="true"><path d="M5 11.5A4.5 4.5 0 0 1 9.5 7H34a4 4 0 0 1 4 4v5.2a5.8 5.8 0 0 0 0 11.6V33a4 4 0 0 1-4 4H9.5A4.5 4.5 0 0 1 5 32.5v-4.8a5.8 5.8 0 0 0 0-11.6z" fill="#ff6a35"/><path d="M15 14v16M15 14h5.5a4 4 0 0 1 0 8H15" fill="none" stroke="#101d35" strokeWidth="3.2" strokeLinecap="round"/><path d="M27 14h4v4h-4zM27 21h4v4h-4zM27 28h4v3h-4z" fill="#101d35"/></svg><span><b>TUBUY</b><small>TICKET</small></span></span>;
}

function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}) {
  return <label className={'field '+(wide?'field-wide':'')}><span>{label}</span>{children}</label>;
}

function EventCard({event,tickets,onOpen}:{event:EventRecord;tickets:TicketType[];onOpen:(e:EventRecord)=>void}) {
  const [imageFailed,setImageFailed] = useState(false);
  const prices = tickets.filter(t=>t.is_enabled && !t.is_sold_out && ticketIsOnSale(t));
  const start = prices.length ? Math.min(...prices.map(t=>Number(t.price))) : null;
  return <a className="event-card" href={`/events/${encodeURIComponent(event.slug)}`} onClick={e=>{e.preventDefault();onOpen(event);}}>
    <div className="event-photo">{event.cover_image_url && !imageFailed ? <img src={event.cover_image_url} alt={event.name} onError={()=>setImageFailed(true)}/> : <div className="photo-placeholder"><Ticket size={42}/><span>YOUR NEXT MOMENT</span></div>}<span className="event-tag">{event.category}</span><span className="photo-arrow"><ArrowUpRight size={18}/></span></div>
    <div className="event-info"><div className="event-meta"><CalendarDays size={14}/>{dateLabel(event.event_date)} <i>·</i> {shortTime(event.start_time)}</div><h3>{event.name}</h3><p><MapPin size={14}/>{event.venue}{event.town ? ' · '+event.town : ''}</p><div className="event-price"><strong>{start===null?'Tickets coming soon':'From '+money(start)}</strong><span>Explore <ArrowRight size={15}/></span></div></div>
  </a>;
}

function App() {
  const [user,setUser] = useState<any>(null);
  const [profile,setProfile] = useState<Profile|null>(null);
  const [organizer,setOrganizer] = useState<Organizer|null>(null);
  const [events,setEvents] = useState<EventRecord[]>([]);
  const [tickets,setTickets] = useState<TicketType[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [paymentWaiting,setPaymentWaiting] = useState(false);
  const [paymentWaitingMessage,setPaymentWaitingMessage] = useState('Connecting securely to the payment provider…');
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [search,setSearch] = useState('');
  const [category,setCategory] = useState('All events');
  const [selected,setSelected] = useState<EventRecord|null>(null);
  const [authOpen,setAuthOpen] = useState(false);
  const [authMode,setAuthMode] = useState<'signin'|'signup'>('signin');
  const [accountType,setAccountType] = useState<'customer'|'organizer'>('customer');
  const [authForm,setAuthForm] = useState({name:'',phone:'',email:'',password:'',organization:''});
  const [view,setView] = useState<'home'|'dashboard'|'tickets'|'terms'|'scanner'>('home');
  const [tab,setTab] = useState<'overview'|'events'|'create'|'issue'|'bookings'|'profile'|'admin'>('overview');
  const [myEvents,setMyEvents] = useState<EventRecord[]>([]);
  const [myBookings,setMyBookings] = useState<Booking[]>([]);
  const [sales,setSales] = useState({bookings:0,tickets:0,revenue:0,commission:0,organizerNet:0});
  const [eventForm,setEventForm] = useState(emptyEvent());
  const [ticketDrafts,setTicketDrafts] = useState<TicketDraft[]>([emptyTicket()]);
  const [coverFile,setCoverFile] = useState<File|null>(null);
  const [editingEvent,setEditingEvent] = useState<string|null>(null);
  const [checkout,setCheckout] = useState(false);
  const [quantities,setQuantities] = useState<Record<string,number>>({});
  const [customerForm,setCustomerForm] = useState({name:'',email:'',phone:''});
  const [checkoutResult,setCheckoutResult] = useState<any>(null);
  const [bookingLookup,setBookingLookup] = useState<any>(null);
  const [mobileNav,setMobileNav] = useState(false);
  const [staffEvents,setStaffEvents] = useState<EventRecord[]>([]);
  const eventSlugFromPath = () => {
    const match = window.location.pathname.match(/^\\/events\\/([^/]+)\\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  };
  const eventPageActive = Boolean(eventSlugFromPath());

  const notify = (text:string) => { setMessage(text); setError(''); window.setTimeout(()=>setMessage(''),5000); };
  const fail = (text:string) => { setError(text); setMessage(''); };
  const isSuperAdmin = ['admin','super_admin'].includes(String(user?.app_metadata?.role||'')) || String(user?.email||'').trim().toLowerCase()==='tubuyticketadmin@gmail.com';

  const loadEvents = useCallback(async () => {
    const apiUrl = 'https://uxhtnxixwusuwnudonyf.supabase.co/rest/v1';
    const apiKey = 'sb_publishable_hOnT2e5OCeaMHbDfaA1Q0g_vLKZnHvX';
    const headers = {
      apikey: apiKey,
      Authorization: 'Bearer '+apiKey,
      Accept: 'application/json'
    };
    const eventParams = new URLSearchParams({
      select: 'id,name,slug,description,category,cover_image_url,organizer_name,event_date,start_time,end_time,venue,town,county,status,organizer_id,contact_email,contact_phone,location_description,terms,edge_function_url,callback_url',
      status: 'eq.published',
      event_date: 'gte.'+new Date().toISOString().slice(0,10),
      order: 'event_date.asc',
      limit: '100'
    });

    let eventResponse: Response;
    try {
      eventResponse = await fetch(apiUrl+'/events?'+eventParams.toString(), {
        method: 'GET',
        headers,
        cache: 'no-store',
        keepalive: true
      });
    } catch(reason:any) {
      fail('Could not connect to the events service: '+(reason?.message||'Network request failed. Please refresh.'));
      return;
    }

    if(!eventResponse.ok) {
      const detail = await eventResponse.text().catch(()=> '');
      fail('Could not load published events ('+eventResponse.status+'): '+(detail||eventResponse.statusText));
      return;
    }

    const rows = await eventResponse.json() as EventRecord[];
    setEvents(Array.isArray(rows)?rows:[]);
    if(!Array.isArray(rows)||!rows.length) {
      setTickets([]);
      return;
    }

    const ticketParams = new URLSearchParams({
      select: 'id,event_id,name,description,price,quantity_total,quantity_sold,quantity_reserved,max_per_customer,is_enabled,is_sold_out,sales_start,sales_end',
      event_id: 'in.('+rows.map(event=>event.id).join(',')+')',
      is_enabled: 'eq.true',
      order: 'sort_order.asc'
    });
    let ticketResponse: Response;
    try {
      ticketResponse = await fetch(apiUrl+'/ticket_types?'+ticketParams.toString(), {
        method: 'GET',
        headers,
        cache: 'no-store',
        keepalive: true
      });
    } catch(reason:any) {
      setTickets([]);
      fail('Events loaded, but ticket options could not be reached: '+(reason?.message||'Network request failed.'));
      return;
    }
    if(!ticketResponse.ok) {
      const detail = await ticketResponse.text().catch(()=> '');
      setTickets([]);
      fail('Events loaded, but ticket options could not be loaded ('+ticketResponse.status+'): '+(detail||ticketResponse.statusText));
      return;
    }
    const ticketRows = await ticketResponse.json();
    setTickets((Array.isArray(ticketRows)?ticketRows:[]) as TicketType[]);
  },[]);

  const loadAccount = useCallback(async (authUser:any) => {
    if(!authUser) { setProfile(null); setOrganizer(null); setMyEvents([]); setMyBookings([]); setStaffEvents([]); return; }
    const [{data:p},{data:o}] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email,phone').eq('id',authUser.id).maybeSingle(),
      supabase.from('organizers').select('id,user_id,organization_name,bio,website,verification_status,payment_method_type,payment_mobile_number,payment_till_number,payment_account_name,verification_notes').eq('user_id',authUser.id).maybeSingle()
    ]);
    setProfile((p as Profile|null)||null);
    setOrganizer((o as Organizer|null)||null);
    const {data:staffRows} = await supabase.from('event_staff').select('event_id').eq('user_id',authUser.id);
    const staffIds = (staffRows||[]).map((row:any)=>row.event_id);
    if(staffIds.length) {
      const {data:staffEventRows} = await supabase.from('events').select('id,name,slug,description,category,cover_image_url,organizer_name,event_date,start_time,end_time,venue,town,county,status,organizer_id,contact_email,contact_phone,location_description,terms,edge_function_url,callback_url').in('id',staffIds);
      setStaffEvents((staffEventRows||[]) as EventRecord[]);
    } else setStaffEvents([]);
    if(o) {
      const {data:owned} = await supabase.from('events').select('id,name,slug,description,category,cover_image_url,organizer_name,event_date,start_time,end_time,venue,town,county,status,organizer_id,contact_email,contact_phone,location_description,terms,edge_function_url,callback_url').eq('organizer_id',o.id).order('created_at',{ascending:false});
      const rows = (owned||[]) as EventRecord[];
      setMyEvents(rows);
      if(rows.length) {
        const ids = rows.map(e=>e.id);
        const [{data:b},{data:t}] = await Promise.all([
          supabase.from('bookings').select('id,event_id,total_amount,booking_status,booking_reference,created_at,platform_commission_rate,platform_commission_amount,organizer_net_amount').in('event_id',ids),
          supabase.from('tickets').select('id,event_id,status').in('event_id',ids)
        ]);
        const bookings = b||[];
        const bookingIds = bookings.map((x:any)=>x.id);
        const {data:paymentRows} = bookingIds.length
          ? await supabase.from('payments').select('booking_id,amount,status,provider').in('booking_id',bookingIds)
          : {data:[]};
        const successfulPayments = (paymentRows||[]).filter((p:any)=>p.status==='successful'&&p.provider!=='demo');
        const successfulBookingIds=new Set(successfulPayments.map((p:any)=>p.booking_id));
        const successfulBookings=bookings.filter((b:any)=>successfulBookingIds.has(b.id));
        setSales({
          bookings:successfulBookingIds.size,
          tickets:(t||[]).filter((x:any)=>x.status!=='demo').length,
          revenue:successfulPayments.reduce((n:number,p:any)=>n+Number(p.amount||0),0),
          commission:successfulBookings.reduce((n:number,b:any)=>n+Number(b.platform_commission_amount||0),0),
          organizerNet:successfulBookings.reduce((n:number,b:any)=>n+Number(b.organizer_net_amount||Math.max(0,Number(b.total_amount||0)-Number(b.platform_commission_amount||0))),0)
        });
      } else setSales({bookings:0,tickets:0,revenue:0,commission:0,organizerNet:0});
    } else setMyEvents([]);
    const {data:bookings} = await supabase.from('bookings').select('id,booking_reference,event_id,total_amount,currency,booking_status,created_at').eq('customer_user_id',authUser.id).order('created_at',{ascending:false}).limit(50);
    setMyBookings((bookings||[]) as Booking[]);  },[]);

  useEffect(()=>{
    let alive=true;

    // Start the public event request immediately; account/profile requests must never
    // block the Discover page from leaving its loading state.
    const eventLoad=loadEvents().catch((reason:any)=>{
      fail('Could not load published events: '+(reason?.message||'Please refresh and try again.'));
    });
    void Promise.race([
      eventLoad,
      new Promise(resolve=>window.setTimeout(resolve,10000))
    ]).finally(()=>{
      if(alive) setLoading(false);
    });

    const start=async()=>{
      try {
        const {data:{session}}=await supabase.auth.getSession();
        if(!alive) return;
        setUser(session?.user||null);
        if(session?.user) {
          setView('dashboard');
          void loadAccount(session.user).catch((reason:any)=>fail('Could not load your account: '+(reason?.message||'Please try again.')));
        }
      } catch(reason:any) {
        if(alive) fail('Could not restore your session: '+(reason?.message||'Please refresh and try again.'));
      }
    };
    void start();

    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      const next=session?.user||null;
      setUser(next);
      if(next) {
        setView('dashboard');
        setTab('overview');
        window.setTimeout(()=>{
          void loadAccount(next).catch((reason:any)=>fail('Could not load your account: '+(reason?.message||'Please try again.')));
        },0);
      } else {
        setView('home');
        void loadAccount(null);
      }
    });
    return ()=>{alive=false;subscription.unsubscribe();};
  },[loadAccount,loadEvents]);

  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return events.filter(e=>(category==='All events'||e.category===category)&&(!term||[e.name,e.description,e.venue,e.town,e.county,e.category].filter(Boolean).join(' ').toLowerCase().includes(term)));
  },[events,search,category]);

  const openAuth=(mode:'signin'|'signup'='signin',role:'customer'|'organizer'='customer')=>{
    setAuthMode(mode);setAccountType(role);setAuthOpen(true);setError('');
  };

  const ensureOrganizer=async (authUser:any,orgName:string)=>{
    const {data:existing,error:readError}=await supabase.from('organizers').select('id,user_id,organization_name,bio,website,verification_status,payment_method_type,payment_mobile_number,payment_till_number,payment_account_name,verification_notes').eq('user_id',authUser.id).maybeSingle();
    if(readError) throw readError;
    if(existing) { setOrganizer(existing as Organizer); return existing; }
    const {data:created,error:createError}=await supabase.from('organizers').insert({user_id:authUser.id,organization_name:orgName||authUser.user_metadata?.full_name||'Event organizer',verification_status:'pending'}).select('id,user_id,organization_name,bio,website,verification_status,payment_method_type,payment_mobile_number,payment_till_number,payment_account_name,verification_notes').single();
    if(createError) throw createError;
    setOrganizer(created as Organizer);
    return created;
  };

  const submitAuth=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');
    try {
      if(authMode==='signup') {
        const {data,error:err}=await supabase.auth.signUp({email:authForm.email.trim(),password:authForm.password,options:{data:{full_name:authForm.name.trim(),phone:authForm.phone.trim(),account_type:accountType,organization_name:authForm.organization.trim()}}});
        if(err) throw err;
        if(data.user && data.session) {
          if(accountType==='organizer') await ensureOrganizer(data.user,authForm.organization);
          setAuthOpen(false);setView(accountType==='organizer'?'dashboard':'dashboard');setTab('overview');
          notify(accountType==='organizer'?'Organizer account created. You can start building your first event.':'Welcome to Tubuy Ticket!');
          await loadAccount(data.user);
        } else {
          setAuthOpen(false);
          notify('Account created. Check your email to confirm your address, then sign in to continue.');
        }
      } else {
        const {data,error:err}=await supabase.auth.signInWithPassword({email:authForm.email.trim(),password:authForm.password});
        if(err) throw err;
        const {data:existingOrganizer} = await supabase.from('organizers').select('id').eq('user_id',data.user.id).maybeSingle();
        const accountRole = existingOrganizer || data.user.user_metadata?.account_type === 'organizer' ? 'organizer' : 'customer';
        if(accountRole==='organizer' && !existingOrganizer) await ensureOrganizer(data.user,data.user.user_metadata?.organization_name || data.user.user_metadata?.full_name || '');
        setAuthOpen(false);setView('dashboard');setTab('overview');
        await loadAccount(data.user);notify('You are signed in. Welcome back!');
      }
        }catch(err:any) { const detail=String(err?.message||'');fail(err?.code==='invalid_credentials'||detail.toLowerCase().includes('invalid login credentials')?'Email or password is incorrect. Check your details and try again.':detail||'Could not complete sign in.'); }
    finally {setBusy(false);}
  };

  const signOut=async()=>{try{const {error:signOutError}=await supabase.auth.signOut({scope:'local'});if(signOutError)throw signOutError;setUser(null);setView('home');setTab('overview');setOrganizer(null);setProfile(null);notify('You have signed out.');}catch(err:any){fail(err.message||'Could not sign out. Please refresh and try again.');}};

  const becomeOrganizer=async()=>{
    if(!user){openAuth('signup','organizer');return;}
    setBusy(true);
    try { await ensureOrganizer(user,profile?.full_name||'');await loadAccount(user);setView('dashboard');setTab('overview');notify('Organizer workspace is ready.'); }
    catch(e:any){fail(e.message||'Could not create organizer profile.');}
    finally{setBusy(false);}
  };

  const resetEventForm=()=>{setEventForm(emptyEvent());setTicketDrafts([emptyTicket()]);setCoverFile(null);setEditingEvent(null);};
  const createOrUpdateEvent=async(e:FormEvent)=>{
    e.preventDefault();
    if(!user||!organizer){fail('Sign in with an organizer account to create events.');return;}
    if(!eventForm.name.trim()||!eventForm.event_date||!eventForm.venue.trim()){fail('Add an event name, date and venue.');return;}
    if(!ticketDrafts.length||ticketDrafts.some(t=>!t.name.trim()||t.price===''||Number(t.price)<0||Number(t.quantity)<1||(t.sales_start&&t.sales_end&&new Date(t.sales_end)<=new Date(t.sales_start)))){fail('Check every ticket type: name, valid price, quantity and sales date range are required.');return;}
    setBusy(true);setError('');
    try{
      let coverUrl:string|null=null;
      if(coverFile){
        const ext=coverFile.name.split('.').pop()?.toLowerCase()||'jpg';
        const path=user.id+'/'+Date.now()+'-'+slugify(eventForm.name)+'.'+ext;
        const {error:uploadError}=await supabase.storage.from('event-media').upload(path,coverFile,{upsert:true,contentType:coverFile.type});
        if(uploadError) throw uploadError;
        coverUrl=supabase.storage.from('event-media').getPublicUrl(path).data.publicUrl;
      }
      const base={
        name:eventForm.name.trim(),slug:slugify(eventForm.name)+'-'+Date.now().toString().slice(-6),
        description:eventForm.description.trim(),category:eventForm.category,
        event_date:eventForm.event_date,start_time:eventForm.start_time,end_time:eventForm.end_time||null,
        venue:eventForm.venue.trim(),town:eventForm.town.trim()||null,county:eventForm.county.trim()||null,
        location_description:eventForm.location_description.trim()||null,terms:eventForm.terms.trim()||null,
        organizer_name:organizer.organization_name||profile?.full_name||user.email,
        contact_email:eventForm.contact_email.trim()||profile?.email||user.email,contact_phone:eventForm.contact_phone.trim()||profile?.phone||user.user_metadata?.phone||PHONE,
        ...(coverUrl?{cover_image_url:coverUrl}:{})
      };
      let eventId=editingEvent;
      if(editingEvent){
        const {error:upErr}=await supabase.from('events').update({...base,status:'pending_review',published_at:null,reviewed_at:null,reviewed_by:null,review_notes:null}).eq('id',editingEvent).eq('organizer_id',organizer.id);
        if(upErr) throw upErr;
        const {data:existing,error:existingErr}=await supabase.from('ticket_types').select('id,quantity_sold,quantity_reserved').eq('event_id',editingEvent);
        if(existingErr) throw existingErr;
        const keptIds=new Set(ticketDrafts.map(t=>t.id).filter(Boolean));
        for(const oldType of existing||[]){
          if(keptIds.has(oldType.id)) continue;
          if(Number(oldType.quantity_sold||0)+Number(oldType.quantity_reserved||0)>0){
            const {error:disableErr}=await supabase.from('ticket_types').update({is_enabled:false}).eq('id',oldType.id);
            if(disableErr) throw disableErr;
          } else {
            const {error:deleteErr}=await supabase.from('ticket_types').delete().eq('id',oldType.id);
            if(deleteErr) throw deleteErr;
          }
        }
      } else {
        const {data:created,error:createErr}=await supabase.from('events').insert({...base,organizer_id:organizer.id,status:'pending_review'}).select('id').single();
        if(createErr) throw createErr;
        eventId=created.id;
      }
      const rows=ticketDrafts.map((t,i)=>({id:t.id||crypto.randomUUID(),event_id:eventId,name:t.name.trim(),description:t.description.trim(),price:Number(t.price),quantity_total:Number(t.quantity),max_per_customer:Number(t.max_per_customer)||10,sales_start:t.sales_start?new Date(t.sales_start).toISOString():null,sales_end:t.sales_end?new Date(t.sales_end).toISOString():null,sort_order:i,is_enabled:true,is_sold_out:false}));
      const {error:ticketErr}=await supabase.from('ticket_types').upsert(rows);
      if(ticketErr) throw ticketErr;
      await loadAccount(user);await loadEvents();resetEventForm();setTab('events');notify(editingEvent?'Changes submitted for administrator review.':'Event submitted for administrator verification. It will remain pending until approved.');
    }catch(err:any){fail(err.message||'Could not save this event.');}
    finally{setBusy(false);}
  };

  const editEvent=async(event:EventRecord)=>{
    setEditingEvent(event.id);
    setEventForm({name:event.name,description:event.description||'',category:event.category,event_date:event.event_date,start_time:shortTime(event.start_time),end_time:shortTime(event.end_time||''),venue:event.venue,town:event.town||'',county:event.county||'',contact_email:(event as any).contact_email||profile?.email||'',contact_phone:(event as any).contact_phone||profile?.phone||'',location_description:(event as any).location_description||'',terms:(event as any).terms||''});
    const {data:rows,error:ticketReadError}=await supabase.from('ticket_types').select('id,name,description,price,quantity_total,max_per_customer,sales_start,sales_end').eq('event_id',event.id).order('sort_order',{ascending:true});
    if(ticketReadError){fail(ticketReadError.message);return;}
    setTicketDrafts(rows?.length?rows.map((t:any)=>({id:t.id,name:t.name,description:t.description||'',price:String(t.price),quantity:String(t.quantity_total),max_per_customer:String(t.max_per_customer||10),sales_start:toDateTimeLocal(t.sales_start),sales_end:toDateTimeLocal(t.sales_end)})):[emptyTicket()]);
    setCoverFile(null);setTab('create');window.scrollTo({top:0,behavior:'smooth'});
  };

  const setEventStatus=async(event:EventRecord,status:string)=>{
    const nextStatus=status==='archived'?'archived':'pending_review';
    const {error:err}=await supabase.from('events').update({status:nextStatus,published_at:null,reviewed_at:null,reviewed_by:null}).eq('id',event.id).eq('organizer_id',organizer?.id);
    if(err){fail(err.message);return;}
    await loadAccount(user);await loadEvents();notify(nextStatus==='archived'?'Event archived.':'Event resubmitted and is awaiting administrator verification.');
  };

  const addTicketDraft=()=>setTicketDrafts(v=>[...v,emptyTicket()]);
  const updateTicketDraft=(index:number,key:keyof TicketDraft,value:string)=>setTicketDrafts(v=>v.map((t,i)=>i===index?{...t,[key]:value}:t));

  const startCheckout=async()=>{
    if(!selected)return;
    const items=Object.entries(quantities).filter(([,q])=>q>0).map(([ticket_type_id,quantity])=>({ticket_type_id,quantity}));
    if(!items.length){fail('Choose at least one ticket first.');return;}
    if(!customerForm.name.trim()||!customerForm.email.trim()||!customerForm.phone.trim()){fail('Enter your name, email and M-PESA phone number.');return;}
    setBusy(true);setError('');setCheckoutResult(null);setBookingLookup(null);setPaymentWaiting(true);setPaymentWaitingMessage('Sending your M-PESA request…');
    let latestPaymentResponse:any=null;
    try{
      const data=await waitForEventFunction(selected,'checkout',{customer:{name:customerForm.name,email:customerForm.email,phone:customerForm.phone},items,idempotency_key:crypto.randomUUID()},message=>setPaymentWaitingMessage(message),40000,response=>{latestPaymentResponse=response;setCheckoutResult(response);const bookingReference=response?.booking_reference||response?.data?.booking_reference;const accessToken=response?.access_token||response?.data?.access_token;if(bookingReference&&accessToken)sessionStorage.setItem('tubuy-payment:'+selected.id,JSON.stringify({booking_reference:bookingReference,access_token:accessToken,request_id:response?.request_id||response?.operation_id,provider_reference:response?.provider_reference}));});
      setCheckoutResult(data);
      const bookingReference=data?.booking_reference||data?.data?.booking_reference;
      const accessToken=data?.access_token||data?.data?.access_token;
      if(bookingReference&&accessToken)sessionStorage.setItem('tubuy-payment:'+selected.id,JSON.stringify({booking_reference:bookingReference,access_token:accessToken,request_id:data?.request_id||data?.operation_id,provider_reference:data?.provider_reference}));
      const finalStatus=String(data?.status||data?.payment_status||data?.payment?.status||data?.data?.status||data?.data?.payment_status||data?.data?.payment?.status||'').toLowerCase();
      const bookingStatus=String(data?.booking?.booking_status||data?.data?.booking?.booking_status||'').toLowerCase();
      if(['completed','complete','success','successful','confirmed'].includes(finalStatus)||bookingStatus==='confirmed'){
        setBookingLookup(data);
        sessionStorage.removeItem('tubuy-payment:'+selected.id);
        setSelected(null);
        setCheckout(false);
        setView('tickets');
        await loadAccount(user);
        notify('Payment successful! Your tickets are ready.');
      } else if(['failed','cancelled','canceled','rejected','declined'].includes(finalStatus)||['failed','expired','cancelled'].includes(bookingStatus)) {
        sessionStorage.removeItem('tubuy-payment:'+selected.id);
        setCheckoutResult({...data,status:'failed'});
        fail(data.message||'Payment was not completed. You can try again. No ticket has been issued.');
      } else notify(data.message||'Your M-PESA request is still processing. Keep this page open; your tickets will appear automatically when payment is confirmed.');
    }catch(err:any){
      const detail=String(err?.message||'');
      if(err?.name==='TimeoutError'||err?.name==='AbortError'||detail.toLowerCase().includes('timed out')) {
        const timeoutResult={...(latestPaymentResponse||{}),status:'pending',message:'Timeout'};
        setCheckoutResult(timeoutResult);
        fail(timeoutResult.message);
      } else fail(detail||'We could not start your payment. Please check your details and try again.');
    }
    finally{setPaymentWaiting(false);setBusy(false);}
  };

  const openDashboard=(next:'overview'|'events'|'create'|'bookings'|'profile'='overview')=>{
    if(!user){openAuth('signin','customer');return;}
    setView('dashboard');setTab(next);setMobileNav(false);window.scrollTo({top:0,behavior:'smooth'});
  };

  useEffect(()=>{
    if(!events.length)return;
    const slug=eventSlugFromPath();
    const legacyEventId=new URLSearchParams(window.location.search).get('event');
    const matchedEvent=slug
      ? events.find(event=>event.slug===slug)
      : legacyEventId ? events.find(event=>event.id===legacyEventId) : null;
    if(matchedEvent){
      setSelected(matchedEvent);
      if(!slug&&legacyEventId){
        window.history.replaceState({},'',`/events/${encodeURIComponent(matchedEvent.slug)}`);
      }
    } else if(slug){
      setSelected(null);
    }
  },[events]);

  useEffect(()=>{
    const handlePopState=()=>{
      const slug=eventSlugFromPath();
      if(!slug){setSelected(null);return;}
      setSelected(events.find(event=>event.slug===slug)||null);
    };
    window.addEventListener('popstate',handlePopState);
    return ()=>window.removeEventListener('popstate',handlePopState);
  },[events]);

  const openEvent=(event:EventRecord)=>{
    window.history.pushState({},'',`/events/${encodeURIComponent(event.slug)}`);
    setSelected(event);setQuantities({});setCheckout(false);setCheckoutResult(null);setBookingLookup(null);
    setCustomerForm({name:profile?.full_name||'',email:profile?.email||user?.email||'',phone:profile?.phone||''});
    window.scrollTo({top:0,behavior:'smooth'});
  };

  const shareEvent=async(event:EventRecord)=>{
    const url=new URL(`/events/${encodeURIComponent(event.slug)}`,window.location.origin);
    const shareUrl=url.toString();
    const shareData={title:event.name,text:`Join me at ${event.name} — ${dateLabel(event.event_date)} at ${event.venue}${event.town?', '+event.town:''}.`,url:shareUrl};
    if(navigator.share){
      try{await navigator.share(shareData);return;}
      catch(err:any){if(err?.name==='AbortError')return;}
    }
    try{await navigator.clipboard.writeText(shareUrl);notify('Event link copied. Share it with your friends!');}
    catch{window.prompt('Copy this event link',shareUrl);}
  };

  const eventTickets=selected?tickets.filter(t=>t.event_id===selected.id&&t.is_enabled):[];
  const selectedTotal=eventTickets.reduce((sum,t)=>sum+(quantities[t.id]||0)*Number(t.price),0);

  useEffect(()=>{
    const description=selected
      ? `Get tickets for ${selected.name} on Tubuy Ticket. ${selected.description||''} ${selected.venue||''} ${selected.town||''}`.replace(/\\s+/g,' ').trim().slice(0,300)
      : 'Find your next unforgettable experience with Tubuy Ticket. Discover events and explore tickets across Kenya.';
    document.title=selected ? `${selected.name} Tickets | ${selected.venue} – Tubuy Ticket` : 'Tubuy Ticket — Events, Tickets & Experiences in Kenya';
    let descriptionTag=document.querySelector('meta[name="description"]') as HTMLMetaElement|null;
    if(!descriptionTag){descriptionTag=document.createElement('meta');descriptionTag.name='description';document.head.appendChild(descriptionTag);}
    descriptionTag.content=description;
    const canonicalUrl=selected ? `${window.location.origin}/events/${encodeURIComponent(selected.slug)}` : `${window.location.origin}/`;
    let canonical=document.querySelector('link[rel="canonical"]') as HTMLLinkElement|null;
    if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
    canonical.href=canonicalUrl;
    const setMeta=(property:string,content:string)=>{
      let tag=document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement|null;
      if(!tag){tag=document.createElement('meta');tag.setAttribute('property',property);document.head.appendChild(tag);}
      tag.content=content;
    };
    setMeta('og:type',selected?'event':'website');
    setMeta('og:title',selected?`${selected.name} Tickets | Tubuy Ticket`:'Tubuy Ticket — Events, Tickets & Experiences in Kenya');
    setMeta('og:description',description);
    setMeta('og:url',canonicalUrl);
    if(selected?.cover_image_url)setMeta('og:image',selected.cover_image_url);
    const schemaId='tubuy-event-jsonld';
    document.getElementById(schemaId)?.remove();
    if(selected){
      const schema={
        '@context':'https://schema.org','@type':'Event',name:selected.name,description:selected.description||undefined,
        startDate:`${selected.event_date}T${selected.start_time||'00:00:00'}+03:00`,
        endDate:selected.end_time?`${selected.event_date}T${selected.end_time}+03:00`:undefined,
        eventStatus:'https://schema.org/EventScheduled',eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',
        image:selected.cover_image_url?[selected.cover_image_url]:undefined,
        location:{'@type':'Place',name:selected.venue,address:{'@type':'PostalAddress',addressLocality:selected.town||undefined,addressRegion:selected.county||undefined,addressCountry:'KE'}},
        organizer:selected.organizer_name?{'@type':'Organization',name:selected.organizer_name}:undefined,
        offers:eventTickets.map(ticket=>({'@type':'Offer',name:ticket.name,price:Number(ticket.price),priceCurrency:'KES',availability:ticket.is_sold_out?'https://schema.org/SoldOut':'https://schema.org/InStock',url:canonicalUrl}))
      };
      const script=document.createElement('script');script.id=schemaId;script.type='application/ld+json';script.textContent=JSON.stringify(schema);document.head.appendChild(script);
    }
    return ()=>{document.getElementById(schemaId)?.remove();};
  },[selected,tickets]);

  return <div className="app-shell">
    <div className="topline"><span className="top-dot"/> YOUR NEXT GREAT STORY STARTS HERE <i>/</i> DISCOVER EVENTS ACROSS KENYA <span className="topline-contact">SUPPORT <a href="tel:+254716625790">0716 625 790</a></span></div>
    <header className="header">
      <a href="#home" className="brand-link" onClick={()=>setView('home')}><Brand/></a>
      <nav className={mobileNav?'nav nav-open':'nav'}>
        <button onClick={()=>{setView('home');setMobileNav(false);}}>Discover</button>
        {user&&<button onClick={()=>{openDashboard('bookings');setMobileNav(false);}}>My tickets</button>}
        {organizer&&<button onClick={()=>{openDashboard('overview');setMobileNav(false);}}>Host dashboard</button>}
        <button onClick={()=>{setView('terms');setMobileNav(false);}}>Terms</button>
        <a href="#support" onClick={()=>setMobileNav(false)}>Support</a>
      </nav>
      <div className="header-right">
        {user ? <><button className="nav-dashboard" onClick={()=>openDashboard('overview')}><User size={15}/>{profile?.full_name?.split(' ')[0]||'My account'}</button><button className="header-cta" onClick={()=>organizer?openDashboard('create'):becomeOrganizer()}>{organizer?'Create event':'Become a host'} <ArrowUpRight size={16}/></button></> : <><button className="signin-link" onClick={()=>openAuth('signin','customer')}>Sign in</button><button className="header-cta" onClick={()=>openAuth('signup','organizer')}>Create organizer account <ArrowUpRight size={16}/></button></>}
      </div>
      <button className="mobile-toggle" onClick={()=>setMobileNav(v=>!v)} aria-label="Open menu">{mobileNav?<X/>:<Menu/>}</button>
    </header>

    {view==='home' ? <main id="home">
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span/> MAKE ROOM FOR THE MOMENT</div><h1>Good plans.<br/><em>Great stories.</em></h1><p>From front-row energy to the little moments that stay with you. Discover events, find your people and make memories across Kenya.</p><div className="hero-actions"><a href="#discover" className="primary-button">Explore events <ArrowUpRight size={17}/></a>{user ? <button className="text-button" onClick={()=>organizer?openDashboard('create'):becomeOrganizer()}>{organizer?'Open host workspace':'Set up host workspace'} <ArrowRight size={16}/></button> : <button className="text-button" onClick={()=>openAuth('signup','organizer')}>Create organizer account <ArrowRight size={16}/></button>}</div><div className="hero-proof"><span><Compass size={17}/></span><div><b>Made for going out</b><small>Experiences, people & places across Kenya</small></div></div></div>
        <div className="hero-art"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="glow"/><div className="ticket-back"><small>ADMIT ONE · NO. 0028</small><b>MAKE<br/>IT A NIGHT.</b><span>GOOD PEOPLE · GOOD MUSIC</span></div><div className="ticket-front"><small>TUBUY PRESENTS ✳</small><Brand light/><h3>YOUR MOMENT.<br/><em>YOUR ENTRY.</em></h3><div className="perforation"/><span>KEEP THE NIGHT OPEN · EST. 2026</span></div><div className="go-stamp">GO <ArrowUpRight size={19}/></div><div className="art-caption">THE GOOD STUFF IS OUT THERE</div></div>
      </section>
      <div className="ticker"><span>LIVE MUSIC</span> ✳ <span>COMMUNITY</span> ✳ <span>ART & CULTURE</span> ✳ <span>GOOD COMPANY</span> ✳ <span>NEW EXPERIENCES</span></div>
      <section className="discover section" id="discover"><div className="section-heading"><div><div className="eyebrow"><span/> THE LINEUP</div><h2>Find your <em>next thing.</em></h2></div><p>Little plans turn into big memories.<br/>Start with what’s happening near you.</p></div>
        <div className="search-tools"><label className="search-box"><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events, places or moments..."/><kbd>⌕</kbd></label><span className="count-label">{filtered.length} EVENTS</span></div>
        <div className="chips"><button className={category==='All events'?'chip active':'chip'} onClick={()=>setCategory('All events')}>All events</button>{CATEGORIES.map(c=><button key={c} className={category===c?'chip active':'chip'} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        {loading?<div className="event-grid">{[1,2,3].map(n=><div className="skeleton" key={n}/>)}</div>:filtered.length?<div className="event-grid">{filtered.map(e=><EventCard key={e.id} event={e} tickets={tickets.filter(t=>t.event_id===e.id)} onOpen={openEvent}/>)}</div>:<div className="empty"><Compass size={30}/><h3>{events.length?'No matching events':'Your next event is on its way.'}</h3><p>{events.length?'Try another search or category.':'There are no published upcoming events at the moment. Check back soon or host the first one.'}</p><button className="primary-button" onClick={()=>openAuth('signup','organizer')}>Create an event <ArrowUpRight size={16}/></button></div>}
        <div className="section-foot"><span>SHOWING PUBLISHED EVENTS</span><span>FRESH PLANS, STRAIGHT FROM THE SOURCE ↗</span></div>
      </section>
      <section className="discover-shortcut"><button onClick={()=>setView('terms')}>Terms & conditions <ArrowUpRight size={15}/></button>{user ? <button onClick={()=>organizer?openDashboard('create'):becomeOrganizer()}>Open host workspace <ArrowUpRight size={15}/></button> : <button onClick={()=>openAuth('signup','organizer')}>Create organizer account <ArrowUpRight size={15}/></button>}</section>
    </main> : view==='dashboard' ? <main className="dashboard section">
      <div className="dashboard-head"><div><div className="eyebrow"><span/> YOUR TUBUY SPACE</div><h1>{isSuperAdmin?'Platform control center':organizer?'Organizer studio':'Your account'}<em>.</em></h1><p>Welcome back, {profile?.full_name||user?.email||'there'}.</p></div><button className="outline-button" onClick={()=>setView('home')}>Back to events <ArrowUpRight size={15}/></button></div>
      <div className="dashboard-layout"><aside className="dash-nav"><div className="dash-user"><span className="avatar">{(profile?.full_name||user?.email||'T').slice(0,1).toUpperCase()}</span><div><b>{profile?.full_name||'Tubuy member'}</b><small>{organizer?'Organizer account':'Customer account'}</small></div></div>{(organizer?[['overview','Overview'],['events','My events'],['create','Create event'],['issue','Issue tickets'],['bookings','Bookings & sales'],['profile','Profile']]:[['overview','Overview'],['bookings','My tickets'],['profile','Profile']]).map(([id,label])=><button key={id} className={tab===id?'dash-item active':'dash-item'} onClick={()=>setTab(id as any)}>{id==='overview'?<Compass size={17}/>:id==='events'?<CalendarDays size={17}/>:id==='create'?<Plus size={17}/>:id==='issue'?<Ticket size={17}/>:id==='bookings'?<Ticket size={17}/>:<User size={17}/>} {label}</button>)}{(organizer||staffEvents.length>0||isSuperAdmin)&&<button className="dash-item" onClick={()=>setView('scanner')}><ScanLine size={17}/> Entry scanner</button>}{isSuperAdmin&&<button className={tab==='admin'?'dash-item active':'dash-item'} onClick={()=>setTab('admin')}><ShieldCheck size={17}/> Event Edge URLs</button>}<button className="dash-item logout" onClick={signOut}><LogOut size={17}/> Sign out</button></aside>
      <div className="dash-content">
        {tab==='overview'&&<><div className="dash-title"><h2>{organizer?'Your event snapshot':'Your Tubuy account'}</h2><p>{organizer?'Keep an eye on events, ticket sales and bookings.':'Discover an event and your tickets will appear here.'}</p></div>{organizer?<><div className="stat-grid"><div><small>YOUR EVENTS</small><b>{myEvents.length}</b><span>Events created</span></div><div><small>PAID BOOKINGS</small><b>{sales.bookings}</b><span>Successful M-PESA payments</span></div><div><small>TICKETS ISSUED</small><b>{sales.tickets}</b><span>Includes complimentary issues</span></div><div><small>GROSS SALES</small><b>{money(sales.revenue)}</b><span>Successful payments only</span></div><div><small>TUBUY COMMISSION</small><b>{money(sales.commission)}</b><span>Platform share</span></div><div><small>YOUR NET EARNINGS</small><b>{money(sales.organizerNet)}</b><span>After platform commission</span></div></div><div className="dash-panel"><div className="panel-head"><h3>Recent events</h3><button onClick={()=>setTab('events')}>View all <ArrowRight size={15}/></button></div>{myEvents.slice(0,4).map(e=><div className="mini-event" key={e.id}><span className="mini-date">{new Date(e.event_date+'T12:00:00').getDate()}<small>{new Date(e.event_date+'T12:00:00').toLocaleDateString('en-KE',{month:'short'})}</small></span><div><b>{e.name}</b><small>{e.venue} · {e.status}</small></div><button onClick={()=>editEvent(e)}>Edit</button></div>)}{!myEvents.length&&<div className="empty compact"><Ticket/><p>You haven’t created an event yet.</p><button className="primary-button" onClick={()=>setTab('create')}>Create your first event <Plus size={16}/></button></div>}</div></>:<div className="dash-panel customer-welcome"><Ticket size={30}/><h3>Ready for your next moment?</h3><p>Browse live events, choose your tickets and keep your booking details here.</p><button className="primary-button" onClick={()=>setView('home')}>Explore events <ArrowUpRight size={16}/></button></div>}</>}
        {tab==='events'&&organizer&&<><div className="dash-title"><h2>My events</h2><p>Create, edit, publish, unpublish or archive the events you host.</p><button className="primary-button" onClick={()=>{resetEventForm();setTab('create')}}><Plus size={16}/> Create event</button></div><div className="owned-list">{myEvents.map(e=><div className="owned-event" key={e.id}><div className="owned-image">{e.cover_image_url?<img src={e.cover_image_url} alt=""/>:<Ticket/>}</div><div className="owned-info"><b>{e.name}</b><small>{dateLabel(e.event_date)} · {e.venue}</small><span className={'status '+(e.status==='published'?'published':'draft')}>{e.status}</span></div><div className="owned-actions"><button onClick={()=>editEvent(e)}>Edit</button>{e.status==='published'?<button onClick={()=>setEventStatus(e,'draft')}>Request changes</button>:e.status!=='archived'?<button className="publish" onClick={()=>setEventStatus(e,'pending_review')}>{e.status==='pending_review'?'Pending verification':'Submit for review'}</button>:null}{e.status!=='archived'&&<button onClick={()=>{if(window.confirm('Archive this event? It will be removed from public Discover.'))void setEventStatus(e,'archived');}}>Archive</button>}</div></div>)}{!myEvents.length&&<div className="empty"><Ticket/><h3>No events yet</h3><p>Set up your first event and publish it when you’re ready.</p><button className="primary-button" onClick={()=>setTab('create')}>Create event <Plus size={16}/></button></div>}</div><OrganizerTicketCatalog events={myEvents} onEdit={editEvent} onError={fail} onChanged={()=>{void loadAccount(user);void loadEvents();}}/></>}
        {tab==='create'&&organizer&&<><div className="dash-title"><h2>{editingEvent?'Edit event':'Create an event'}</h2><p>Tell people what’s happening. Save a draft, then publish it when ready.</p></div><form className="event-form" onSubmit={createOrUpdateEvent}><div className="form-section"><h3>Event details</h3><div className="form-grid"><Field label="Event name *" wide><input required value={eventForm.name} onChange={e=>setEventForm({...eventForm,name:e.target.value})} placeholder="e.g. Nairobi Summer Fest"/></Field><Field label="Category"><select value={eventForm.category} onChange={e=>setEventForm({...eventForm,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="Event date *"><input required type="date" min={new Date().toISOString().slice(0,10)} value={eventForm.event_date} onChange={e=>setEventForm({...eventForm,event_date:e.target.value})}/></Field><Field label="Start time"><input type="time" value={eventForm.start_time} onChange={e=>setEventForm({...eventForm,start_time:e.target.value})}/></Field><Field label="End time"><input type="time" value={eventForm.end_time} onChange={e=>setEventForm({...eventForm,end_time:e.target.value})}/></Field><Field label="Venue *"><input required value={eventForm.venue} onChange={e=>setEventForm({...eventForm,venue:e.target.value})} placeholder="Venue or location name"/></Field><Field label="Town / city"><input value={eventForm.town} onChange={e=>setEventForm({...eventForm,town:e.target.value})} placeholder="Nairobi"/></Field><Field label="County"><input value={eventForm.county} onChange={e=>setEventForm({...eventForm,county:e.target.value})} placeholder="Nairobi County"/></Field><Field label="Event contact email"><input type="email" value={eventForm.contact_email} onChange={e=>setEventForm({...eventForm,contact_email:e.target.value})} placeholder={profile?.email||'events@example.com'}/></Field><Field label="Event contact phone"><input value={eventForm.contact_phone} onChange={e=>setEventForm({...eventForm,contact_phone:e.target.value})} placeholder={profile?.phone||PHONE}/></Field><Field label="Location directions" wide><input value={eventForm.location_description} onChange={e=>setEventForm({...eventForm,location_description:e.target.value})} placeholder="Landmarks, directions or map details"/></Field><Field label="Event description" wide><textarea rows={5} value={eventForm.description} onChange={e=>setEventForm({...eventForm,description:e.target.value})} placeholder="What should guests know? Include the highlights, schedule and what to expect."/></Field><Field label="Entry terms & conditions" wide><textarea rows={3} value={eventForm.terms} onChange={e=>setEventForm({...eventForm,terms:e.target.value})} placeholder="Optional event entry rules, age limits, refund terms..."/></Field><Field label="Event poster / banner (JPG, PNG or WebP)" wide><label className="upload-box"><ImagePlus/><span>{coverFile?coverFile.name:'Upload the poster or banner guests will see on Discover'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label></Field></div></div><div className="form-section"><div className="ticket-heading"><div><h3>Ticket categories</h3><p>Add prices, quantities and limits for each type.</p></div><button type="button" className="outline-button" onClick={addTicketDraft}><Plus size={15}/> Add ticket type</button></div>{ticketDrafts.map((t,i)=><div className="ticket-draft" key={i}><div className="ticket-draft-top"><b>Ticket type {i+1}</b>{ticketDrafts.length>1&&<button type="button" onClick={()=>setTicketDrafts(v=>v.filter((_,n)=>n!==i))}><X size={15}/></button>}</div><div className="form-grid"><Field label="Ticket name *"><input required value={t.name} onChange={e=>updateTicketDraft(i,'name',e.target.value)} placeholder="Early bird / Regular / VIP"/></Field><Field label="Price (KES) *"><input required type="number" min="0" step="1" value={t.price} onChange={e=>updateTicketDraft(i,'price',e.target.value)} placeholder="1000"/></Field><Field label="Quantity available *"><input required type="number" min="1" value={t.quantity} onChange={e=>updateTicketDraft(i,'quantity',e.target.value)}/></Field><Field label="Max per customer"><input type="number" min="1" max="100" value={t.max_per_customer} onChange={e=>updateTicketDraft(i,'max_per_customer',e.target.value)}/></Field><Field label="Description" wide><input value={t.description} onChange={e=>updateTicketDraft(i,'description',e.target.value)} placeholder="What this ticket includes (optional)"/></Field><Field label="Sales open (optional)"><input type="datetime-local" value={t.sales_start} onChange={e=>updateTicketDraft(i,'sales_start',e.target.value)}/></Field><Field label="Sales close (optional)"><input type="datetime-local" value={t.sales_end} onChange={e=>updateTicketDraft(i,'sales_end',e.target.value)}/></Field></div></div>)}</div><div className="form-actions"><button type="button" className="outline-button" onClick={()=>{resetEventForm();setTab('events')}}>Cancel</button><button className="primary-button" disabled={busy}>{busy?'Saving…':editingEvent?'Save changes':'Save event draft'} <ArrowRight size={16}/></button></div><p className="form-note"><ShieldCheck size={14}/> Every new or edited event is sent to Pending verification. Only the main administrator can approve it after checking your organizer profile, event details and ticket categories.</p></form></>}
        {tab==='issue'&&organizer&&<OrganizerTicketIssuer events={myEvents} onIssued={()=>{void loadAccount(user);}} onError={fail}/>}
        {tab==='bookings'&&<><div className="dash-title"><h2>{organizer?'Bookings & sales':'My tickets'}</h2><p>{organizer?'Confirmed and pending bookings for your events.':'Your recent ticket purchases and booking references.'}</p></div>{organizer?<div className="booking-list">{myEvents.length?myEvents.map(e=><div className="booking-event-group" key={e.id}><h3>{e.name}</h3><OrganizerBookings event={e} onError={fail}/></div>):<p className="muted">Create an event to start receiving bookings.</p>}</div>:<div className="booking-list">{myBookings.map(b=><div className="booking-row" key={b.id}><div><b>{b.booking_reference}</b><small>{dateLabel(b.created_at.slice(0,10))} · {b.booking_status}</small></div><strong>{money(b.total_amount)}</strong><button onClick={async()=>{const {data,error:ticketReadError}=await supabase.from('tickets').select('ticket_code,status,ticket_type_id,holder_name,event_id').eq('booking_id',b.id);if(ticketReadError){fail(ticketReadError.message);return;}const {data:event}=await supabase.from('events').select('name,event_date,start_time,end_time,venue,town,cover_image_url').eq('id',b.event_id).maybeSingle();const typeIds=(data||[]).map((t:any)=>t.ticket_type_id);const {data:types}=typeIds.length?await supabase.from('ticket_types').select('id,name,description,price,quantity_total,max_per_customer,sales_start,sales_end').in('id',typeIds):{data:[]};const typeMap=new Map((types||[]).map((t:any)=>[t.id,t]));setBookingLookup({booking:b,event,tickets:(data||[]).map((t:any)=>({...t,ticket_type:typeMap.get(t.ticket_type_id)?.name||'Admission',ticket_type_details:typeMap.get(t.ticket_type_id)||null}))});}}>View tickets</button></div>)}{!myBookings.length&&<div className="empty"><Ticket/><h3>No bookings yet</h3><p>Tickets you purchase while signed in will show up here.</p><button className="primary-button" onClick={()=>setView('home')}>Discover events</button></div>}{bookingLookup?.tickets&&<div className="dash-panel"><div className="panel-head"><h3>Ticket details</h3><button onClick={()=>setBookingLookup(null)}><X size={15}/></button></div>{bookingLookup.tickets.map((t:any)=><TicketCard key={t.ticket_code} ticket={t} event={bookingLookup.event} customerName={t.holder_name||profile?.full_name||'Ticket holder'}/>)}</div>}</div>}</>}
        {tab==='admin'&&isSuperAdmin&&<SuperAdminPanel onError={fail}/>}
        {tab==='profile'&&<><div className="dash-title"><h2>Profile & account</h2><p>Keep your contact details up to date.</p></div><ProfileEditor profile={profile} user={user} organizer={organizer} onSaved={async()=>{await loadAccount(user);notify('Profile updated.');}} onError={fail}/><div className="support-card"><h3>Need a hand?</h3><p>Talk to the Tubuy Ticket support team.</p><a href="tel:+254716625790"><Headphones size={16}/> Call us · 0716625790</a><a href={WHATSAPP} target="_blank" rel="noreferrer"><MessageCircle size={16}/> WhatsApp us</a><a href="mailto:tubuyticket@gmail.com"><Mail size={16}/> Email · tubuyticket@gmail.com</a></div></>}
      </div></div>
    </main> : view==='tickets' ? <main className="section ticket-success-page"><div className="ticket-success-header"><div className="eyebrow"><span/> PAYMENT CONFIRMED</div><h1>Your tickets are <em>ready.</em></h1><p>Download your tickets and keep them ready for entry.</p></div>{bookingLookup?.tickets?.length ? <div className="ticket-success-list">{bookingLookup.tickets.map((ticket:any)=><TicketCard key={ticket.ticket_code} ticket={ticket} event={bookingLookup.event||selected} customerName={ticket.holder_name||bookingLookup.booking?.customer_name||customerForm.name||'Ticket holder'} onDownloaded={()=>{setBookingLookup(null);setCheckoutResult(null);setSelected(null);setCheckout(false);setView('home');window.scrollTo({top:0,behavior:'smooth'});}}/>)}</div> : <div className="empty"><Ticket/><h3>Tickets are being prepared</h3><p>Your payment is confirmed. Refresh your account or contact support if your tickets do not appear.</p><button className="primary-button" onClick={()=>{setView('home');setBookingLookup(null);}}>Back to home</button></div>}<button className="outline-button ticket-home-button" onClick={()=>{setView('home');setBookingLookup(null);setCheckoutResult(null);}}>Return to homepage</button></main> : view==='terms' ? <main className="legal-page section"><div className="eyebrow"><span/> THE IMPORTANT DETAILS</div><h1>Terms & <em>conditions.</em></h1><p className="legal-intro">These terms explain how Tubuy Ticket works when you browse events, buy tickets or host an event. By using the platform, you agree to them.</p><article><h2>1. Accounts and eligibility</h2><p>You must provide accurate information, keep your login details secure and be legally able to enter into a binding agreement. You are responsible for activity under your account. Tubuy Ticket may suspend accounts used for fraud, abuse or unlawful activity.</p><h2>2. Tickets and bookings</h2><p>A booking is not confirmed until the payment provider confirms successful payment and Tubuy Ticket marks the booking as confirmed. Digital tickets are generated only for verified successful bookings. Each ticket is unique, intended for one admission and must not be copied, resold unlawfully or altered.</p><h2>3. Event information and organizer responsibilities</h2><p>Event organizers are responsible for accurate event descriptions, dates, times, venues, age restrictions, ticket quantities, entry rules, permits, safety arrangements and delivery of the advertised event. Organizers must honor valid tickets and may not exceed published ticket quantities.</p><h2>4. Payments, fees and receipts</h2><p>Payments are processed by the payment provider shown at checkout. Provider terms and charges may apply. A payment prompt, pending transaction or payment screenshot is not proof of successful payment. Keep your transaction confirmation and Tubuy Ticket receipt.</p><h2>5. Cancellations, changes and refunds</h2><p>Event cancellation, postponement, rescheduling and refund requests are handled in line with the event organizer's published policy and applicable Kenyan law. Unless required by law or expressly stated by the organizer, tickets are generally non-refundable for a change of mind or failure to attend. Contact the organizer first; Tubuy Ticket support can assist with the process but does not guarantee a refund.</p><h2>6. Entry, QR codes and duplicate use</h2><p>Present the original digital ticket at the venue. Organizers or authorized staff may scan the QR code and validate it against Tubuy Ticket's server. A ticket is admitted only once. A ticket already checked in, cancelled, refunded, invalid or associated with an unconfirmed booking may be refused.</p><h2>7. Prohibited conduct</h2><p>You must not attempt to bypass payment, forge or duplicate tickets, interfere with scanning, scrape or attack the service, misuse personal information, or use Tubuy Ticket for unlawful, unsafe or misleading events.</p><h2>8. Platform availability and liability</h2><p>We aim to keep the service available and accurate but do not guarantee uninterrupted access or that every event will proceed as planned. To the extent permitted by law, Tubuy Ticket is not responsible for an organizer's event delivery, indirect losses or third-party payment-provider outages. Nothing in these terms excludes liability that cannot lawfully be excluded.</p><h2>9. Privacy and communications</h2><p>Personal information is used to operate accounts, bookings, payment verification, ticket delivery, security and support. Do not share another person's information without authority. See any separate privacy notice presented on the platform for more details.</p><h2>10. Support and changes</h2><p>We may update these terms as the service changes. Material updates will be published on this page. Questions or complaints: 0716625790, tubuyticket@gmail.com or WhatsApp +254716625790.</p><p className="legal-note">This is a general platform terms template, not legal advice. Have a Kenyan lawyer review it before launch, especially the refund, privacy and liability provisions.</p></article><button className="primary-button" onClick={()=>setView('home')}>Back to Discover <ArrowRight size={16}/></button></main> : view==='scanner' ? <main className="section scanner-page"><div className="dashboard-head"><div><div className="eyebrow"><span/> EVENT ENTRY</div><h1>Ticket <em>scanner.</em></h1><p>Scan or enter a ticket code. Every check is verified on the server.</p></div><button className="outline-button" onClick={()=>setView('dashboard')}>Back to dashboard</button></div><TicketScanner events={[...myEvents,...staffEvents].filter((event,index,all)=>all.findIndex(item=>item.id===event.id)===index)} /></main> : null}

    {view==='home'&&<footer className="footer" id="support"><div className="footer-main"><div><Brand light/><p>Your moment. Your entry.<br/>Discover events and make memories across Kenya.</p></div><div><b>Explore</b><a href="#discover" onClick={()=>setView('home')}>Find events</a><button onClick={()=>user?(organizer?openDashboard('create'):becomeOrganizer()):openAuth('signup','organizer')}>Host an event</button><a href="#how">How it works</a></div><div><b>Support</b><a href="tel:+254716625790"><Headphones size={15}/> Call us · 0716625790</a><a href={WHATSAPP} target="_blank" rel="noreferrer"><MessageCircle size={15}/> WhatsApp us</a><a href="mailto:tubuyticket@gmail.com"><Mail size={15}/> Email · tubuyticket@gmail.com</a></div></div><div className="footer-bottom"><span>© 2026 TUBUY TICKET. ALL RIGHTS RESERVED.</span><a href="#terms" onClick={e=>{e.preventDefault();setView('terms');}}>TERMS & CONDITIONS</a><a href="#home" onClick={()=>setView('home')}>BACK TO TOP ↑</a></div></footer>}
    {view==='home'&&<a className="whatsapp-float" href={WHATSAPP} target="_blank" rel="noreferrer" aria-label="Chat with Tubuy Ticket on WhatsApp"><MessageCircle size={22}/><span>Chat with us</span></a>}

    {message&&<div className="toast success"><Check size={17}/>{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}
    {error&&<div className="toast error"><X size={17}/>{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}

    {authOpen&&<div className="modal-backdrop" onClick={()=>setAuthOpen(false)}><div className="auth-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setAuthOpen(false)}><X/></button><Brand/><div className="eyebrow"><span/> {authMode==='signup'?'JOIN THE GOOD TIMES':'WELCOME BACK'}</div><h2>{authMode==='signup'?'Create your account':'Sign in to Tubuy'}</h2><p>One account for discovering events, managing tickets and hosting experiences.</p><div className="auth-switch"><button className={authMode==='signin'?'active':''} onClick={()=>setAuthMode('signin')}>Sign in</button><button className={authMode==='signup'?'active':''} onClick={()=>setAuthMode('signup')}>Create account</button></div><form onSubmit={submitAuth}>{authMode==='signup'&&<div className="role-switch"><button type="button" className={accountType==='customer'?'active':''} onClick={()=>setAccountType('customer')}><User size={16}/> Customer</button><button type="button" className={accountType==='organizer'?'active':''} onClick={()=>setAccountType('organizer')}><CalendarDays size={16}/> Organizer</button></div>}{authMode==='signup'&&<><Field label="Full name"><input required value={authForm.name} onChange={e=>setAuthForm({...authForm,name:e.target.value})} placeholder="Your full name"/></Field><Field label="Phone number"><input required value={authForm.phone} onChange={e=>setAuthForm({...authForm,phone:e.target.value})} placeholder="07xx xxx xxx"/></Field>{accountType==='organizer'&&<Field label="Organization / brand name"><input required value={authForm.organization} onChange={e=>setAuthForm({...authForm,organization:e.target.value})} placeholder="Your event brand or company"/></Field>}</>}<Field label="Email address"><input required type="email" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} placeholder="you@example.com"/></Field><Field label="Password"><input required type="password" minLength={8} value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} placeholder="At least 8 characters"/></Field><button className="primary-button full" disabled={busy}>{busy?'Please wait…':authMode==='signup'?'Create account':'Sign in'} <ArrowRight size={16}/></button></form><small className="legal-note">By continuing, you agree to use Tubuy Ticket responsibly. Account verification may be required.</small></div></div>}

    {selected&&<div className={eventPageActive?'modal-backdrop event-page-backdrop':'modal-backdrop'} onClick={()=>{if(!paymentWaiting&&!eventPageActive)setSelected(null);}}><div className={eventPageActive?'event-modal event-page-card':'event-modal'} onClick={e=>e.stopPropagation()}><button className="modal-close" disabled={paymentWaiting} aria-label={eventPageActive?'Back to events':'Close event'} onClick={()=>{if(eventPageActive){window.history.pushState({},'','/');setSelected(null);}else setSelected(null);}}><X/></button>{selected.cover_image_url?<img className="modal-cover" src={selected.cover_image_url} alt={selected.name}/>:<div className="modal-cover modal-cover-empty"><Ticket size={46}/></div>}<div className="modal-event-body">{paymentWaiting&&<div className="payment-waiting-overlay" role="status" aria-live="polite"><div className="payment-waiting-card"><div className="payment-orbit"><span/><span/><span/><Ticket size={27}/></div><div className="eyebrow"><span/> SECURE M-PESA CHECKOUT</div><h3>Waiting for your <em>payment.</em></h3><p>{paymentWaitingMessage}</p><div className="payment-progress"><span/></div><small>Keep this window open. Do not submit another payment.</small></div></div>}<div className="eyebrow"><span/> {selected.category}</div><h2>{selected.name}</h2><div className="event-details"><span><CalendarDays/>{dateLabel(selected.event_date)} · {shortTime(selected.start_time)}</span><span><MapPin/>{selected.venue}{selected.town?', '+selected.town:''}</span>{selected.organizer_name&&<span><Users/>{selected.organizer_name}</span>}</div><button className="outline-button event-share-button" onClick={()=>void shareEvent(selected)}><Share2 size={15}/> Share event</button><p className="event-description">{selected.description||'Join us for this experience. See you there!'}</p>{(selected as any).location_description&&<p className="event-description"><b>Directions:</b> {(selected as any).location_description}</p>}{(selected as any).terms&&<details><summary>Entry terms & conditions</summary><p>{(selected as any).terms}</p></details>}<div className="ticket-options"><h3>Choose your tickets</h3>{eventTickets.length?eventTickets.map(t=><div className="ticket-option" key={t.id}><div><b>{t.name}</b><small>{t.description||'Event admission'} · {Math.max(0,t.quantity_total-t.quantity_sold-t.quantity_reserved)} left · {ticketSaleLabel(t)}</small><strong>{money(t.price)}</strong></div><div className="quantity-control"><button onClick={()=>setQuantities(q=>({...q,[t.id]:Math.max(0,(q[t.id]||0)-1)}))}><Minus size={14}/></button><b>{quantities[t.id]||0}</b><button disabled={!ticketIsOnSale(t)||t.is_sold_out||t.quantity_sold+t.quantity_reserved>=t.quantity_total} onClick={()=>setQuantities(q=>({...q,[t.id]:Math.min(t.max_per_customer,(q[t.id]||0)+1)}))}><Plus size={14}/></button></div></div>):<p className="muted">Ticket categories will be available soon.</p>}</div>{eventTickets.length>0&&<div className="checkout-area"><div className="checkout-total"><span>Selected tickets</span><b>{money(selectedTotal)}</b></div>{!checkout?<button className="primary-button full" disabled={selectedTotal<=0} onClick={()=>setCheckout(true)}>Continue to checkout <ArrowRight size={16}/></button>:<><h3>Guest details</h3><div className="form-grid"><Field label="Full name"><input value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} placeholder="Ticket holder name"/></Field><Field label="Email"><input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})} placeholder="Email for booking"/></Field><Field label="M-PESA phone"><input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})} placeholder="0716 625 790"/></Field></div><button className="primary-button full" onClick={startCheckout} disabled={busy}>{busy?'Starting payment…':checkoutResult?.status==='failed'?'Try payment again':'Pay with M-PESA'} <ArrowRight size={16}/></button><small className="legal-note">You will receive an M-PESA prompt on your phone if the payment service is configured.</small></>}{checkoutResult&&<div className="payment-result"><b>{['completed','complete','success','successful','confirmed'].includes(String(checkoutResult.status||checkoutResult.payment_status||checkoutResult.data?.status||checkoutResult.data?.payment_status||'').toLowerCase())?'Payment successful': ['failed','cancelled','canceled','rejected','declined'].includes(String(checkoutResult.status||checkoutResult.payment_status||checkoutResult.data?.status||checkoutResult.data?.payment_status||'').toLowerCase())?'Payment failed':'Payment pending'}</b><p>{checkoutResult.message||'The payment provider is processing your request.'}{(checkoutResult.booking_reference||checkoutResult.data?.booking_reference)&&<> Booking reference: <strong>{checkoutResult.booking_reference||checkoutResult.data?.booking_reference}</strong></>}</p></div>}{bookingLookup?.tickets&&<div className="ticket-issued"><b className="ticket-success-title">Payment verified · your tickets are ready</b><div className="ticket-confetti" aria-hidden="true">✦ ✧ ✦</div>{bookingLookup.tickets.map((t:any)=><TicketCard key={t.ticket_code} ticket={t} event={bookingLookup.event||selected} customerName={bookingLookup.booking?.customer_name||customerForm.name}/>)}</div>}</div>}</div></div></div>}

  </div>;
}

function OrganizerTicketIssuer({events,onIssued,onError}:{events:EventRecord[];onIssued:()=>void;onError:(message:string)=>void}) {
  const [eventId,setEventId]=useState(events[0]?.id||'');
  const [ticketTypeId,setTicketTypeId]=useState('');
  const [ticketTypes,setTicketTypes]=useState<any[]>([]);
  const [form,setForm]=useState({name:'',email:'',phone:'',quantity:'1'});
  const [issued,setIssued]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const event=events.find(item=>item.id===eventId)||null;
  const selectedType=ticketTypes.find(item=>item.id===ticketTypeId)||null;
  const remaining=selectedType?Math.max(0,Number(selectedType.quantity_total)-Number(selectedType.quantity_sold)-Number(selectedType.quantity_reserved)):0;

  useEffect(()=>{
    let active=true;
    setTicketTypes([]);
    setTicketTypeId('');
    setIssued(null);
    if(!eventId) return ()=>{active=false;};
    void supabase.from('ticket_types').select('id,event_id,name,description,price,quantity_total,quantity_sold,quantity_reserved,max_per_customer,sales_start,sales_end,is_enabled,is_sold_out,sort_order').eq('event_id',eventId).eq('is_enabled',true).order('sort_order',{ascending:true}).then(({data,error})=>{
      if(!active) return;
      if(error){onError(error.message);return;}
      const available=(data||[]).filter((item:any)=>!item.is_sold_out&&Number(item.quantity_total)>Number(item.quantity_sold)+Number(item.quantity_reserved));
      setTicketTypes(available);
      setTicketTypeId(available[0]?.id||'');
    });
    return ()=>{active=false;};
  },[eventId]);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    if(!eventId||!ticketTypeId||!form.name.trim()||!form.email.trim()||!form.phone.trim()) return;
    const quantity=Number(form.quantity);
    if(!Number.isInteger(quantity)||quantity<1||quantity>20||quantity>remaining){onError('Choose a valid quantity within the available ticket stock (maximum 20 per issue).');return;}
    setBusy(true);
    try{
      if(!event)throw new Error('Choose an event first.');
      const {data:issueData,error:issueError}=await supabase.rpc('organizer_issue_manual_tickets',{
        p_event_id:eventId,
        p_ticket_type_id:ticketTypeId,
        p_customer_name:form.name.trim(),
        p_customer_email:form.email.trim(),
        p_customer_phone:form.phone.trim(),
        p_quantity:quantity
      });
      if(issueError)throw issueError;
      const data=issueData||{};
      const codes=(data.tickets||[]).map((ticket:any)=>ticket.ticket_code).filter(Boolean);
      if(!codes.length)throw new Error('The database did not return the issued ticket codes. Please refresh the organizer bookings before issuing again.');
      const {data:createdTickets,error:ticketReadError}=codes.length
        ? await supabase.from('tickets').select('id,booking_id,event_id,ticket_type_id,ticket_code,holder_name,holder_email,status,created_at,scanned_at').in('ticket_code',codes)
        : {data:[],error:null};
      if(ticketReadError) throw ticketReadError;
      const visibleTickets=(createdTickets||[]).map((ticket:any)=>({...ticket,ticket_type:selectedType?.name||'Admission',ticket_type_details:selectedType}));
      setIssued({...data,tickets:visibleTickets.length?visibleTickets:(data.tickets||[]).map((ticket:any)=>({...ticket,ticket_type:selectedType?.name||'Admission',ticket_type_details:selectedType}))});
      onIssued();
    }catch(err:any){onError(err.message||'Could not issue these tickets.');}
    finally{setBusy(false);}
  };

  return <>
    <div className="dash-title"><h2>Issue tickets to a guest</h2><p>Create complimentary tickets for someone who is not checking out online. Each ticket gets its own QR code and uses your event inventory.</p></div>
    {!events.length?<div className="empty"><Ticket/><h3>No events available</h3><p>Create an event and add ticket categories before issuing guest tickets.</p></div>:<form className="event-form" onSubmit={submit}>
      <div className="form-section"><h3>Event and ticket</h3><div className="form-grid">
        <Field label="Choose event *" wide><select required value={eventId} onChange={e=>setEventId(e.target.value)}>{events.map(item=><option key={item.id} value={item.id}>{item.name} · {item.event_date}</option>)}</select></Field>
        <Field label="Ticket category *" wide><select required value={ticketTypeId} onChange={e=>setTicketTypeId(e.target.value)} disabled={!ticketTypes.length}>{ticketTypes.map(item=><option key={item.id} value={item.id}>{item.name} · {money(item.price)} · {Math.max(0,item.quantity_total-item.quantity_sold-item.quantity_reserved)} available</option>)}</select></Field>
        {selectedType&&<div className="field field-wide"><span>Issue type</span><p className="muted">Complimentary · KES 0 charged · {remaining} tickets available</p></div>}
      </div></div>
      <div className="form-section"><h3>Ticket holder details</h3><div className="form-grid">
        <Field label="Full name *"><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Guest full name"/></Field>
        <Field label="Email address *"><input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="guest@example.com"/></Field>
        <Field label="Phone number *"><input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="07xx xxx xxx"/></Field>
        <Field label="Number of tickets *"><input required type="number" min="1" max={Math.min(20,remaining||20)} value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></Field>
      </div></div>
      <p className="form-note"><ShieldCheck size={14}/> This issues complimentary tickets; it does not record a cash or M-PESA payment. Issued tickets count against your available stock.</p>
      <div className="form-actions"><button className="primary-button" disabled={busy||!ticketTypeId||!remaining||Number(form.quantity)>remaining}>{busy?'Issuing tickets…':'Issue tickets'} <Ticket size={16}/></button></div>
      {!ticketTypes.length&&<p className="muted">No enabled ticket category with remaining stock is available for this event.</p>}
    </form>}
    {issued&&event&&<div className="dash-panel" style={{marginTop:20}}><div className="panel-head"><div><h3>Tickets issued successfully</h3><p className="muted">{issued.booking_reference} · {issued.quantity} complimentary ticket(s) · KES 0</p></div></div><div className="ticket-issued"><b className="ticket-success-title">Give these tickets to {form.name}</b><div className="ticket-confetti" aria-hidden="true">✦ ✧ ✦</div>{(issued.tickets||[]).map((ticket:any)=><TicketCard key={ticket.ticket_code} ticket={ticket} event={event} customerName={form.name}/>)}</div></div>}
  </>;
}


function OrganizerTicketCatalog({events,onEdit,onError,onChanged}:{events:EventRecord[];onEdit:(event:EventRecord)=>void;onError:(message:string)=>void;onChanged:()=>void}) {
  const [eventId,setEventId]=useState(events[0]?.id||'');
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [working,setWorking]=useState<string|null>(null);
  const selectedEvent=events.find(event=>event.id===eventId)||null;

  useEffect(()=>{if(!events.some(event=>event.id===eventId)&&events[0])setEventId(events[0].id);},[events,eventId]);

  const refresh=async()=>{
    if(!eventId){setRows([]);return;}
    setLoading(true);
    const {data,error}=await supabase.from('ticket_types').select('id,event_id,name,description,price,quantity_total,quantity_sold,quantity_reserved,max_per_customer,sales_start,sales_end,is_enabled,is_sold_out,sort_order').eq('event_id',eventId).order('sort_order',{ascending:true});
    setLoading(false);
    if(error){onError(error.message);return;}
    setRows(data||[]);
  };

  useEffect(()=>{void refresh();},[eventId]);

  const setEnabled=async(row:any,enabled:boolean)=>{
    setWorking(row.id);
    const {error}=await supabase.from('ticket_types').update({is_enabled:enabled}).eq('id',row.id).eq('event_id',eventId);
    setWorking(null);
    if(error){onError(error.message);return;}
    await refresh();
    onChanged();
  };

  const remove=async(row:any)=>{
    if(Number(row.quantity_sold||0)+Number(row.quantity_reserved||0)>0){
      if(!window.confirm('This ticket category already has sold or reserved tickets. Remove it from sale instead? Existing tickets and bookings will remain valid.'))return;
      await setEnabled(row,false);
      return;
    }
    if(!window.confirm('Permanently delete this ticket category? This cannot be undone.'))return;
    setWorking(row.id);
    const {error}=await supabase.from('ticket_types').delete().eq('id',row.id).eq('event_id',eventId);
    setWorking(null);
    if(error){
      const {error:disableError}=await supabase.from('ticket_types').update({is_enabled:false}).eq('id',row.id).eq('event_id',eventId);
      if(disableError){onError(error.message);return;}
      onError('This category is linked to existing booking records, so it has been safely removed from sale instead of deleted.');
    }
    await refresh();
    onChanged();
  };

  return <section className="ticket-catalog">
    <div className="panel-head"><div><h3>Ticket categories & properties</h3><p className="muted">Review ticket settings, update them or remove categories you no longer need.</p></div></div>
    {events.length>0&&<Field label="Choose event"><select value={eventId} onChange={e=>setEventId(e.target.value)}>{events.map(event=><option key={event.id} value={event.id}>{event.name} · {dateLabel(event.event_date)}</option>)}</select></Field>}
    {loading?<p className="muted">Loading ticket categories…</p>:rows.length?rows.map(row=>{
      const remaining=Math.max(0,Number(row.quantity_total)-Number(row.quantity_sold)-Number(row.quantity_reserved));
      return <article className="ticket-property-card" key={row.id}>
        <div className="ticket-property-head"><div><span className={'status '+(row.is_enabled?'published':'draft')}>{row.is_enabled?'Available for sale':'Hidden from sale'}</span><h4>{row.name}</h4><p>{row.description||'No description added'}</p></div><b>{money(row.price)}</b></div>
        <div className="ticket-property-grid">
          <div><small>Total quantity</small><b>{row.quantity_total}</b></div>
          <div><small>Sold</small><b>{row.quantity_sold}</b></div>
          <div><small>Reserved</small><b>{row.quantity_reserved}</b></div>
          <div><small>Remaining</small><b>{remaining}</b></div>
          <div><small>Max per customer</small><b>{row.max_per_customer}</b></div>
          <div><small>Sales open</small><b>{row.sales_start?readableDate(row.sales_start):'Immediately'}</b></div>
          <div><small>Sales close</small><b>{row.sales_end?readableDate(row.sales_end):'No closing time'}</b></div>
        </div>
        <div className="ticket-property-actions">
          <button className="outline-button" onClick={()=>selectedEvent&&onEdit(selectedEvent)}><Pencil size={14}/> Edit ticket properties</button>
          {row.is_enabled?<button className="outline-button" disabled={working===row.id} onClick={()=>void setEnabled(row,false)}>Remove from sale</button>:<button className="outline-button" disabled={working===row.id||remaining===0} onClick={()=>void setEnabled(row,true)}>Enable for sale</button>}
          <button className="outline-button danger-button" disabled={working===row.id} onClick={()=>void remove(row)}><Trash2 size={14}/> Delete</button>
        </div>
      </article>;
    }):<div className="empty compact"><Ticket/><p>No ticket categories have been added to this event yet.</p><button className="primary-button" onClick={()=>selectedEvent&&onEdit(selectedEvent)}>Add ticket category <Plus size={15}/></button></div>}
    {!events.length&&<p className="muted">Create an event first to manage ticket categories.</p>}
  </section>;
}

function OrganizerBookings({event,onError}:{event:EventRecord;onError:(message:string)=>void}) {
  const [rows,setRows]=useState<any[]>([]);
  const [payments,setPayments]=useState<any[]>([]);
  const [tickets,setTickets]=useState<any[]>([]);
  const [types,setTypes]=useState<any[]>([]);
  const [viewingTicket,setViewingTicket]=useState<any>(null);
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const refresh=async()=>{
    setLoading(true);
    const {data:bookingRows,error:bookingError}=await supabase.from('bookings').select('id,booking_reference,customer_name,customer_email,customer_phone,total_amount,booking_status,created_at').eq('event_id',event.id).order('created_at',{ascending:false});
    if(bookingError){setLoading(false);onError(bookingError.message);return;}
    const ids=(bookingRows||[]).map((b:any)=>b.id);
    if(!ids.length){setRows([]);setPayments([]);setTickets([]);setTypes([]);setLoading(false);return;}
    const [{data:paymentRows,error:paymentError},{data:ticketRows,error:ticketError}]=await Promise.all([
      supabase.from('payments').select('id,booking_id,amount,status,provider,method,provider_reference,verified_at').in('booking_id',ids),
      supabase.from('tickets').select('id,booking_id,event_id,ticket_type_id,ticket_code,holder_name,holder_email,status,created_at,scanned_at').in('booking_id',ids).order('created_at',{ascending:false})
    ]);
    if(paymentError||ticketError){setLoading(false);onError(paymentError?.message||ticketError?.message||'Could not load booking details.');return;}
    const typeIds=[...new Set((ticketRows||[]).map((t:any)=>t.ticket_type_id).filter(Boolean))];
    const {data:typeRows,error:typeError}=typeIds.length?await supabase.from('ticket_types').select('id,name,description,price,max_per_customer,sales_start,sales_end').in('id',typeIds):{data:[],error:null};
    if(typeError){setLoading(false);onError(typeError.message);return;}
    setRows(bookingRows||[]);setPayments(paymentRows||[]);setTickets(ticketRows||[]);setTypes(typeRows||[]);setLoading(false);
  };
  useEffect(()=>{void refresh();},[event.id]);
  const paymentMap=new Map(payments.map((p:any)=>[p.booking_id,p]));
  const bookingMap=new Map(rows.map((b:any)=>[b.id,b]));
  const typeMap=new Map(types.map((t:any)=>[t.id,t]));
  const paidRows=payments.filter((p:any)=>p.status==='successful'&&p.provider!=='demo');
  const paidTotal=paidRows.reduce((sum:number,p:any)=>sum+Number(p.amount||0),0);
  const paidBookingCount=new Set(paidRows.map((p:any)=>p.booking_id)).size;
  const complimentaryCount=rows.filter((b:any)=>String(b.booking_reference||'').startsWith('TBT-MAN-')).length;
  const exportTickets=()=>{
    if(!tickets.length){setNotice('There are no tickets to export for this event yet.');return;}
    const columns=['Event','Booking reference','Ticket code','Ticket holder','Holder email','Ticket category','Ticket price','Booking total','Payment status','Ticket status','Issued at'];
    const quote=(value:any)=>'"'+String(value??'').replace(/"/g,'""')+'"';
    const lines=[columns.map(quote).join(','),...tickets.map((t:any)=>{
      const booking=bookingMap.get(t.booking_id);const payment=paymentMap.get(t.booking_id);const type=typeMap.get(t.ticket_type_id);
      return [event.name,booking?.booking_reference,t.ticket_code,t.holder_name,t.holder_email,type?.name,type?.price,booking?.total_amount,payment?.status||(Number(booking?.total_amount||0)===0?'complimentary':'unpaid'),t.status,t.created_at].map(quote).join(',');
    })];
    const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='Tubuy-'+slugify(event.name)+'-tickets.csv';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
    setNotice('Ticket export downloaded.');
  };
  const openTicket=(ticket:any)=>{const type=typeMap.get(ticket.ticket_type_id)||null;setViewingTicket({...ticket,ticket_type:type?.name||'Admission',ticket_type_details:type});};
  const cancelTicket=async(ticket:any)=>{
    if(ticket.status!=='valid'){setNotice(ticket.status==='used'?'Checked-in tickets cannot be cancelled.':'Only valid tickets can be cancelled.');return;}
    if(!window.confirm('Cancel this ticket? It will no longer admit the holder. Its record will be kept for payment and check-in history.'))return;
    const {data:updated,error}=await supabase.from('tickets').update({status:'cancelled'}).eq('id',ticket.id).eq('status','valid').select('id').maybeSingle();
    if(error){onError(error.message);return;}if(!updated){setNotice('Ticket could not be cancelled. It may already have been checked in or changed.');await refresh();return;}
    const {data:{user:actor}}=await supabase.auth.getUser();
    if(actor) await supabase.from('audit_logs').insert({actor_id:actor.id,action:'ticket_cancelled',entity_type:'ticket',entity_id:ticket.id,details:{ticket_code:ticket.ticket_code,event_id:event.id,booking_id:ticket.booking_id}});
    setNotice('Ticket '+ticket.ticket_code+' cancelled. The audit record was retained.');setViewingTicket(null);await refresh();
  };
  return <section className="organizer-bookings">
    <div className="booking-sales-summary"><div><small>PAID SALES</small><b>{money(paidTotal)}</b></div><div><small>PAID BOOKINGS</small><b>{paidBookingCount}</b></div><div><small>COMPLIMENTARY BOOKINGS</small><b>{complimentaryCount}</b></div><div><small>TICKETS ISSUED</small><b>{tickets.length}</b></div></div>
    <div className="booking-export-row"><span>Paid sales use successful payment records. Complimentary guest tickets are not revenue.</span><button className="outline-button" onClick={exportTickets}><Download size={15}/> Export tickets CSV</button></div>
    {notice&&<p className="booking-notice">{notice}</p>}
    {loading?<p className="muted">Loading bookings and tickets…</p>:rows.length?<div className="booking-management-list">{rows.map((booking:any)=>{
      const payment=paymentMap.get(booking.id);const paid=payment?.status==='successful'&&payment?.provider!=='demo';const isDemo=payment?.provider==='demo';const isComp=String(booking.booking_reference||'').startsWith('TBT-MAN-');const amount=paid?Number(payment.amount):Number(booking.total_amount||0);const bookingTickets=tickets.filter((t:any)=>t.booking_id===booking.id);
      return <article className="booking-management-card" key={booking.id}><div className="booking-management-head"><div><b>{booking.customer_name||'Guest'}</b><small>{booking.booking_reference} · {booking.customer_email||'No email'} · {booking.customer_phone||'No phone'}</small></div><strong>{money(amount)}</strong></div><div className="booking-management-meta"><span className={'status '+(paid||isComp?'published':'draft')}>{paid?'Paid':isDemo?'Demo payment':isComp?'Complimentary':'Payment '+(payment?.status||booking.booking_status)}</span><span>{bookingTickets.length} ticket(s)</span><span>{readableDate(booking.created_at)}</span></div>
        {bookingTickets.length>0&&<div className="booking-ticket-list">{bookingTickets.map((ticket:any)=><div className="booking-ticket-line" key={ticket.id}><div><b>{ticket.ticket_code}</b><small>{typeMap.get(ticket.ticket_type_id)?.name||'Admission'} · {ticket.holder_name||booking.customer_name} · {ticket.status}</small></div><div className="booking-ticket-actions"><button className="outline-button" onClick={()=>openTicket(ticket)}>View / download</button><button className="outline-button danger-button" disabled={ticket.status!=='valid'} onClick={()=>void cancelTicket(ticket)}><Ban size={14}/> Cancel</button></div></div>)}</div>}
      </article>;
    })}</div>:<p className="muted">No bookings for this event yet.</p>}
    {viewingTicket&&<div className="ticket-preview-backdrop" role="presentation" onClick={()=>setViewingTicket(null)}><section className="ticket-preview-modal" role="dialog" aria-modal="true" aria-label="Ticket preview" onClick={e=>e.stopPropagation()}><div className="ticket-preview-heading"><div><span className="eyebrow">TUBUY TICKET</span><h3>Ticket preview</h3><p>View the ticket details or download its branded PDF.</p></div><button type="button" className="ticket-preview-close" aria-label="Close ticket preview" onClick={()=>setViewingTicket(null)}><X size={19}/></button></div><TicketCard ticket={viewingTicket} event={event} customerName={viewingTicket.holder_name||'Ticket holder'}/></section></div>}
  </section>;
}

function SuperAdminPanel({onError}:{onError:(message:string)=>void}) {
  const [events,setEvents]=useState<any[]>([]);
  const [stats,setStats]=useState({events:0,organizers:0,tickets:0,revenue:0});
  const [functionUrls,setFunctionUrls]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState<string|null>(null);
  const [savedEvent,setSavedEvent]=useState<string|null>(null);
  const refresh=async()=>{
    setLoading(true);
    const [{count:eventCount},{count:organizerCount},{count:ticketCount},{data:payments},{data:eventRows,error:eventError}]=await Promise.all([
      supabase.from('events').select('id',{count:'exact',head:true}),
      supabase.from('organizers').select('id',{count:'exact',head:true}),
      supabase.from('tickets').select('id',{count:'exact',head:true}),
      supabase.from('payments').select('amount,status,provider'),
      supabase.from('events').select('id,name,status,event_date,edge_function_url').order('created_at',{ascending:false}).limit(100)
    ]);
    if(eventError){setLoading(false);onError(eventError.message);return;}
    const successful=(payments||[]).filter((p:any)=>p.status==='successful'&&p.provider!=='demo');
    setStats({events:eventCount||0,organizers:organizerCount||0,tickets:ticketCount||0,revenue:successful.reduce((n:number,p:any)=>n+Number(p.amount||0),0)});
    setEvents(eventRows||[]);
    setFunctionUrls(Object.fromEntries((eventRows||[]).map((event:any)=>[event.id,String(event.edge_function_url||'')])));
    setLoading(false);
  };
  useEffect(()=>{void refresh();},[]);
  const saveFunctionUrl=async(event:any)=>{
    const url=(functionUrls[event.id]||'').trim();
    if(url){try{const parsed=new URL(url);if(parsed.protocol!=='https:')throw new Error('Use a secure HTTPS Edge Function URL.');}catch(reason:any){onError(reason.message||'Enter a valid HTTPS Edge Function URL.');return;}}
    setWorking(event.id);setSavedEvent(null);
    const {error}=await supabase.from('events').update({edge_function_url:url||null}).eq('id',event.id);
    setWorking(null);
    if(error){onError(error.message);return;}
    setEvents(current=>current.map(item=>item.id===event.id?{...item,edge_function_url:url||null}:item));
    setSavedEvent(event.id);
  };
  const updateStatus=async(event:any,status:string)=>{
    setWorking(event.id);const {error}=await supabase.from('events').update({status,published_at:status==='published'?new Date().toISOString():null}).eq('id',event.id);setWorking(null);
    if(error){onError(error.message);return;}await refresh();
  };
  return <div className="super-admin-panel">
    <div className="dash-title"><h2>Super admin controls</h2><p>Configure the live backend endpoint separately for every event.</p></div>
    <div className="stat-grid"><div><small>ALL EVENTS</small><b>{stats.events}</b><span>Across the platform</span></div><div><small>ORGANIZERS</small><b>{stats.organizers}</b><span>Organizer accounts</span></div><div><small>TICKETS</small><b>{stats.tickets}</b><span>Issued ticket records</span></div><div><small>SUCCESSFUL PAYMENTS</small><b>{money(stats.revenue)}</b><span>Verified payment totals</span></div></div>
    <div className="dash-panel"><div className="panel-head"><div><h3>Event payment connections</h3><p className="muted">Each event uses its own secure payment connection.</p></div><a className="outline-button" href="https://supabase.com/dashboard/project/uxhtnxixwusuwnudonyf/functions" target="_blank" rel="noreferrer">Supabase functions <ExternalLink size={14}/></a></div>
      <div className="event-function-contract"><b>Payment connection</b><p>Connect this event to its secure payment service. The website waits for payment confirmation and displays tickets automatically when the payment succeeds.</p><p>Use a secure HTTPS address. Keep payment credentials private and never place them in the website's public settings.</p></div>
    </div>
    <div className="dash-panel"><div className="panel-head"><div><h3>Configure each event</h3><p className="muted">Enter one HTTPS URL per event and press Save. It is stored on that event's database row.</p></div><button className="outline-button" onClick={()=>void refresh()} disabled={loading}>Refresh</button></div>
      {loading?<p className="muted">Loading events…</p>:events.map(event=><article className="admin-event-endpoint" key={event.id}>
        <div className="mini-event"><div><b>{event.name}</b><small>{dateLabel(event.event_date)} · {event.status}</small></div><span className={'status '+(event.status==='published'?'published':'draft')}>{event.status}</span><div className="owned-actions">{event.status==='published'?<button disabled={working===event.id} onClick={()=>void updateStatus(event,'draft')}>Unpublish</button>:<button disabled={working===event.id} onClick={()=>void updateStatus(event,'published')}>Publish</button>}</div></div>
        <div className="event-function-editor"><label htmlFor={'event-function-'+event.id}>PAYMENT CONNECTION · {event.name}</label><input id={'event-function-'+event.id} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={functionUrls[event.id]||''} onChange={e=>setFunctionUrls(current=>({...current,[event.id]:e.target.value}))} placeholder="https://your-domain/functions/event-gateway"/><div className="event-function-actions"><button className="outline-button" disabled={working===event.id} onClick={()=>void saveFunctionUrl(event)}>{working===event.id?'Saving…':'Save event URL'}</button>{functionUrls[event.id]&&<a href={functionUrls[event.id]} target="_blank" rel="noreferrer">Open endpoint <ExternalLink size={13}/></a>}{savedEvent===event.id&&<span role="status">Saved to this event</span>}</div></div>
      </article>)}
      {!loading&&!events.length&&<p className="muted">No events found. Create an event first, then its endpoint field appears here.</p>}
    </div>
  </div>;
}

function ProfileEditor({profile,user,organizer,onSaved,onError}:{profile:Profile|null;user:any;organizer:Organizer|null;onSaved:()=>void;onError:(s:string)=>void}) {
  const [name,setName]=useState(profile?.full_name||'');
  const [phone,setPhone]=useState(profile?.phone||'');
  const [orgName,setOrgName]=useState(organizer?.organization_name||'');
  const [bio,setBio]=useState(organizer?.bio||'');
  const [website,setWebsite]=useState(organizer?.website||'');
  const [paymentMethod,setPaymentMethod]=useState(organizer?.payment_method_type||'mobile_number');
  const [paymentMobile,setPaymentMobile]=useState(organizer?.payment_mobile_number||'');
  const [paymentTill,setPaymentTill]=useState(organizer?.payment_till_number||'');
  const [paymentAccountName,setPaymentAccountName]=useState(organizer?.payment_account_name||'');
  useEffect(()=>{setName(profile?.full_name||'');setPhone(profile?.phone||'');setOrgName(organizer?.organization_name||'');setBio(organizer?.bio||'');setWebsite(organizer?.website||'');setPaymentMethod(organizer?.payment_method_type||'mobile_number');setPaymentMobile(organizer?.payment_mobile_number||'');setPaymentTill(organizer?.payment_till_number||'');setPaymentAccountName(organizer?.payment_account_name||'')},[profile,organizer]);
  const save=async(e:FormEvent)=>{e.preventDefault();const {error}=await supabase.from('profiles').update({full_name:name,phone}).eq('id',user.id);if(error){onError(error.message);return;}if(organizer){if(paymentMethod==='mobile_number'&&!paymentMobile.trim()){onError('Enter the M-PESA mobile number that should receive payouts.');return;}if(paymentMethod==='till_number'&&!paymentTill.trim()){onError('Enter the M-PESA till number that should receive payouts.');return;}const {error:oe}=await supabase.from('organizers').update({organization_name:orgName,bio,website,payment_method_type:paymentMethod,payment_mobile_number:paymentMethod==='mobile_number'?paymentMobile.trim():null,payment_till_number:paymentMethod==='till_number'?paymentTill.trim():null,payment_account_name:paymentAccountName.trim()||null}).eq('id',organizer.id);if(oe){onError(oe.message);return;}}onSaved();};
  return <form className="event-form profile-form" onSubmit={save}><div className="form-grid"><Field label="Full name"><input value={name} onChange={e=>setName(e.target.value)} required/></Field><Field label="Phone number"><input value={phone} onChange={e=>setPhone(e.target.value)}/></Field><Field label="Email address"><input value={user.email||''} disabled/></Field>{organizer&&<><Field label="Organization name"><input value={orgName} onChange={e=>setOrgName(e.target.value)}/></Field><Field label="Website"><input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://"/></Field><Field label="Organizer bio" wide><textarea rows={4} value={bio} onChange={e=>setBio(e.target.value)} placeholder="Tell guests about your organization"/></Field><Field label="Payout method"><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="mobile_number">Mobile number (M-PESA)</option><option value="till_number">Till number</option></select></Field>{paymentMethod==='mobile_number'?<Field label="M-PESA mobile number"><input value={paymentMobile} onChange={e=>setPaymentMobile(e.target.value)} placeholder="07XX XXX XXX or 2547XXXXXXXX" required/></Field>:<Field label="M-PESA till number"><input value={paymentTill} onChange={e=>setPaymentTill(e.target.value)} placeholder="Enter your till number" required/></Field>}<Field label="Account / business name"><input value={paymentAccountName} onChange={e=>setPaymentAccountName(e.target.value)} placeholder="Name registered to the payment destination"/></Field><div className="field field-wide"><span>Organizer verification</span><p className="muted">{organizer.verification_status==='verified'?'Verified by Tubuy Ticket administration':`Status: ${organizer.verification_status||'pending'}. Your events remain pending until the administrator completes verification.`}</p></div></>}</div><button className="primary-button">Save profile <Check size={16}/></button></form>;
}

export default App;
