import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { Download, Ticket as TicketIcon } from 'lucide-react';

type TicketCardProps = {
  ticket: any;
  event: any;
  customerName: string;
  onDownloaded?: () => void;
};

const readableDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not specified';

const money = (value: unknown) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const safeFileName = (value: string) =>
  value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

export default function TicketCard({ ticket, event, customerName, onDownloaded }: TicketCardProps) {
  const [qr, setQr] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const typeDetails = ticket.ticket_type_details || {};
  const typeName = ticket.ticket_type || typeDetails.name || 'Admission';
  const eventDate = event?.event_date
    ? new Date(event.event_date + 'T12:00:00').toLocaleDateString('en-KE', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'See event details';
  const eventTime = String(event?.start_time || '').slice(0, 5) || 'To be announced';
  const venue = [event?.venue, event?.town].filter(Boolean).join(', ') || 'See event details';
  const salesWindow = (typeDetails.sales_start ? readableDate(typeDetails.sales_start) : 'Immediately')
    + ' – '
    + (typeDetails.sales_end ? readableDate(typeDetails.sales_end) : 'No closing time');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(String(ticket.ticket_code), {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 420,
      color: { dark: '#101D35', light: '#FFFFFF' },
    })
      .then((url) => { if (active) setQr(url); })
      .catch(() => { if (active) setDownloadError('The ticket QR could not be generated. Please refresh and try again.'); });
    return () => { active = false; };
  }, [ticket.ticket_code]);

  const downloadPdf = async () => {
    if (!qr || downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      // A print-friendly, branded admission pass with a dedicated QR/check-in panel.
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [200, 130] });
      const navy: [number, number, number] = [16, 29, 53];
      const orange: [number, number, number] = [255, 106, 53];
      const cream: [number, number, number] = [255, 248, 241];
      const muted: [number, number, number] = [183, 195, 207];

      doc.setFillColor(...cream);
      doc.rect(0, 0, 200, 130, 'F');
      doc.setFillColor(...navy);
      doc.roundedRect(4, 4, 192, 122, 4, 4, 'F');
      doc.setFillColor(...orange);
      doc.roundedRect(4, 4, 192, 23, 4, 4, 'F');
      doc.rect(4, 19, 192, 8, 'F');

      doc.setTextColor(...navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('TUBUY TICKET', 12, 19);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('YOUR MOMENT. YOUR ENTRY.', 187, 18, { align: 'right' });

      doc.setTextColor(...cream);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      const eventTitle = doc.splitTextToSize(String(event?.name || 'Event admission'), 125);
      doc.text(eventTitle.slice(0, 2), 12, 39);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text('TICKET HOLDER', 12, 54);
      doc.text('TICKET CATEGORY', 78, 54);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...cream);
      doc.text(doc.splitTextToSize(String(customerName || 'Ticket holder'), 58).slice(0, 1), 12, 60);
      doc.text(doc.splitTextToSize(String(typeName), 58).slice(0, 1), 78, 60);

      doc.setDrawColor(70, 86, 108);
      doc.line(12, 66, 137, 66);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text('EVENT DATE', 12, 75);
      doc.text('START TIME', 78, 75);
      doc.text('VENUE', 12, 91);
      doc.text('TICKET PRICE', 78, 91);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...cream);
      doc.text(eventDate, 12, 81);
      doc.text(eventTime, 78, 81);
      doc.text(doc.splitTextToSize(venue, 58).slice(0, 1), 12, 97);
      doc.text(typeDetails.price !== undefined ? money(typeDetails.price) : 'As booked', 78, 97);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text('MAX PER CUSTOMER', 12, 108);
      doc.text('SALES WINDOW', 78, 108);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...cream);
      doc.text(typeDetails.max_per_customer ? String(typeDetails.max_per_customer) : 'As configured', 12, 114);
      doc.text(doc.splitTextToSize(salesWindow, 58).slice(0, 1), 78, 114);

      // Perforated divider and high-contrast QR panel.
      doc.setDrawColor(255, 106, 53);
      doc.setLineDash([1.2, 1.5], 0);
      doc.line(145, 31, 145, 116);
      doc.setLineDash([], 0);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(153, 37, 35, 35, 2, 2, 'F');
      doc.addImage(qr, 'PNG', 155, 39, 31, 31);
      doc.setTextColor(...orange);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('SCAN AT ENTRY', 170.5, 81, { align: 'center' });
      doc.setTextColor(...cream);
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.text(doc.splitTextToSize(String(ticket.ticket_code), 43).slice(0, 2), 170.5, 91, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text('STATUS', 170.5, 104, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...cream);
      doc.text(String(ticket.status || 'valid').toUpperCase(), 170.5, 111, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...muted);
      doc.text('Keep this ticket ready. Each QR code admits one ticket holder.', 12, 121);

      const fileName = 'Tubuy-Ticket-' + safeFileName(String(ticket.ticket_code || 'admission')) + '.pdf';
      doc.save(fileName);
      onDownloaded?.();
    } catch (error: any) {
      setDownloadError(error?.message || 'Could not create the PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <article className="digital-ticket">
      <div>
        <h4>{event?.name || 'Event admission'}</h4>
        <p><b>Ticket holder:</b> {customerName || 'Ticket holder'}</p>
        {ticket.holder_email && <p><b>Holder email:</b> {ticket.holder_email}</p>}
        <p><b>Category:</b> {typeName}</p>
        {typeDetails.description && <p><b>Includes:</b> {typeDetails.description}</p>}
        <p><b>Price:</b> {typeDetails.price !== undefined ? money(typeDetails.price) : 'As booked'}</p>
        {typeDetails.max_per_customer && <p><b>Max per customer:</b> {typeDetails.max_per_customer}</p>}
        {(typeDetails.sales_start || typeDetails.sales_end) && (
          <p><b>Sales window:</b> {salesWindow}</p>
        )}
        <p><b>Ticket no:</b> <strong>{ticket.ticket_code}</strong></p>
        <p><b>Date:</b> {eventDate} · {eventTime}</p>
        <p><b>Venue:</b> {venue}</p>
        <p><b>Status:</b> {ticket.status || 'valid'}</p>
      </div>
      {qr ? <img src={qr} alt={'Unique QR code for ' + ticket.ticket_code} /> : <div className="qr-placeholder"><TicketIcon /></div>}
      <div className="ticket-card-actions">
        <button className="outline-button" type="button" onClick={() => setDetailsOpen((value) => !value)}>
          {detailsOpen ? 'Hide ticket details' : 'View full ticket'}
        </button>
        <button className="outline-button ticket-download-button" type="button" onClick={downloadPdf} disabled={!qr || downloading}>
          <Download size={15} />{downloading ? 'Preparing PDF…' : 'Download branded PDF'}
        </button>
      </div>
      {detailsOpen && (
        <div className="ticket-expanded-details">
          <p><b>Ticket code:</b> {ticket.ticket_code}</p>
          <p><b>Holder:</b> {customerName || 'Ticket holder'}</p>
          {ticket.holder_email && <p><b>Holder email:</b> {ticket.holder_email}</p>}
          <p><b>Event:</b> {event?.name || 'Event admission'}</p>
          <p><b>Category:</b> {typeName}</p>
          <p><b>Price:</b> {typeDetails.price !== undefined ? money(typeDetails.price) : 'As booked'}</p>
          <p><b>Maximum per customer:</b> {typeDetails.max_per_customer || 'As configured'}</p>
          <p><b>Sales window:</b> {salesWindow}</p>
          <p><b>Date and time:</b> {eventDate} · {eventTime}</p>
          <p><b>Venue:</b> {venue}</p>
          <p><b>Status:</b> {ticket.status || 'valid'}</p>
        </div>
      )}
      {downloadError && <p className="ticket-download-error" role="alert">{downloadError}</p>}
    </article>
  );
}
