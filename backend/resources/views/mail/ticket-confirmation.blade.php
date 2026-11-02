@extends('mail.layout')

@php
    $font = 'Inter,Segoe UI,Helvetica,Arial,sans-serif';
    $mono = 'SFMono-Regular,Menlo,Consolas,Courier New,monospace';
    $first = trim(explode(' ', (string) $order->buyer_name)[0]) ?: 'there';
    $count = $tickets->count();
    $money = fn ($v) => $order->currency.' '.number_format((float) $v, (float) $v == floor((float) $v) ? 0 : 2);
    $free = (float) $order->total <= 0;
    // Real sends embed the QR as an inline attachment (cid:), which Gmail
    // shows; browser previews have no $message, so fall back to a data URI.
    $qr = function (string $code) use (&$message) {
        $png = \App\Mail\TicketConfirmation::qrPng($code);
        return isset($message)
            ? $message->embedData($png, $code.'.png', 'image/png')
            : 'data:image/png;base64,'.base64_encode($png);
    };
@endphp

@section('title', "Your tickets for {$event->title}")
@section('preheader', "{$count} ".\Illuminate\Support\Str::plural('ticket', $count)." confirmed · {$starts->format('D j M, g:ia')} · {$where}")

@section('content')

{{-- ── Hero ─────────────────────────────────────────────────────────── --}}
@if($event->cover_url)
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:0;">
    <a href="{{ $eventUrl }}"><img src="{{ $event->cover_url }}" width="600" alt="{{ $event->title }}"
      style="width:100%;max-width:600px;height:auto;max-height:300px;object-fit:cover;display:block;"></a>
  </td></tr>
</table>
@endif

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:36px 44px 8px;font-family:{{ $font }};">
    {{-- Status pill --}}
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td bgcolor="#0F2E2E" style="background-color:#0F2E2E;border:1px solid #1E5A55;border-radius:999px;padding:6px 14px;font-family:{{ $font }};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#19E6CE;">
        &#10003;&nbsp; Booking confirmed
      </td>
    </tr></table>

    <h1 class="tk-hero-title" style="margin:20px 0 0;font-family:{{ $font }};font-size:34px;line-height:40px;font-weight:800;letter-spacing:-0.8px;color:#FFFFFF;">
      You're going to<br><span style="color:#19E6CE;">{{ $event->title }}</span>
    </h1>
    <p style="margin:14px 0 0;font-size:16px;line-height:25px;color:#AEB9CE;">
      {{ $intro }}
    </p>
  </td></tr>
</table>

{{-- ── When / where tiles ───────────────────────────────────────────── --}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:22px 44px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="tk-stack" width="50%" valign="top" style="width:50%;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td bgcolor="#101A2D" style="background-color:#101A2D;border:1px solid #1C2740;border-radius:16px;padding:16px 18px;font-family:{{ $font }};">
            <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#5C6A85;">&#128197;&nbsp; When</div>
            <div style="margin-top:6px;font-size:16px;line-height:22px;font-weight:700;color:#FFFFFF;">{{ $starts->format('l, j F') }}</div>
            <div style="margin-top:2px;font-size:14px;line-height:20px;color:#AEB9CE;">
              {{ $starts->format('g:ia') }}@if($ends) – {{ $ends->isSameDay($starts) ? $ends->format('g:ia') : $ends->format('D j M, g:ia') }}@endif
            </div>
          </td>
        </tr></table>
      </td>
      <td class="tk-stack tk-stack-gap" width="50%" valign="top" style="width:50%;padding-left:12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td bgcolor="#101A2D" style="background-color:#101A2D;border:1px solid #1C2740;border-radius:16px;padding:16px 18px;font-family:{{ $font }};">
            <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#5C6A85;">&#128205;&nbsp; Where</div>
            <div style="margin-top:6px;font-size:16px;line-height:22px;font-weight:700;color:#FFFFFF;">{{ $where }}</div>
            @if($event->location_map_link)
              <div style="margin-top:2px;font-size:14px;line-height:20px;"><a href="{{ $event->location_map_link }}" style="color:#19E6CE;text-decoration:none;font-weight:600;">Open in Maps &rarr;</a></div>
            @endif
          </td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>
</table>

{{-- ── Tickets: one boarding pass each ──────────────────────────────── --}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:30px 44px 0;font-family:{{ $font }};">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#5C6A85;">
      Your {{ \Illuminate\Support\Str::plural('ticket', $count) }}
    </div>
  </td></tr>

  @foreach($tickets as $i => $ticket)
  <tr><td class="tk-pad" style="padding:14px 44px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="border-radius:20px;overflow:hidden;border:1px solid #23406A;">
      {{-- Stub header --}}
      <tr><td bgcolor="#123B4A" style="background-color:#123B4A;background-image:linear-gradient(120deg,#0F4C4C 0%,#123B66 60%,#2A2370 100%);padding:18px 22px;font-family:{{ $font }};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle" style="font-family:{{ $font }};">
            <div style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#7FF5E8;">Admit one</div>
            <div style="margin-top:3px;font-size:19px;line-height:24px;font-weight:800;color:#FFFFFF;">{{ $ticket->ticketTier?->name ?? 'General admission' }}</div>
            @if($ticket->attendee?->full_name)
              <div style="margin-top:2px;font-size:13px;color:#C5D3EA;">{{ $ticket->attendee->full_name }}</div>
            @endif
          </td>
          <td align="right" valign="middle" style="font-family:{{ $mono }};font-size:12px;font-weight:700;color:#C5D3EA;white-space:nowrap;">
            {{ str_pad($i + 1, 2, '0', STR_PAD_LEFT) }} / {{ str_pad($count, 2, '0', STR_PAD_LEFT) }}
          </td>
        </tr></table>
      </td></tr>

      {{-- Perforation --}}
      <tr><td bgcolor="#0E1729" style="background-color:#0E1729;padding:0 22px;">
        <div style="border-top:2px dashed #2A3A5C;height:0;line-height:0;font-size:0;">&nbsp;</div>
      </td></tr>

      {{-- QR --}}
      <tr><td bgcolor="#0E1729" align="center" style="background-color:#0E1729;padding:24px 22px 22px;font-family:{{ $font }};">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:16px;padding:12px;">
            <img src="{{ $qr($ticket->code) }}" width="190" height="190" alt="QR code {{ $ticket->code }}" style="width:190px;height:190px;display:block;">
          </td>
        </tr></table>
        <div style="margin-top:14px;font-family:{{ $mono }};font-size:17px;font-weight:700;letter-spacing:2px;color:#FFFFFF;">{{ $ticket->code }}</div>
        <div style="margin-top:4px;font-size:12px;color:#5C6A85;">Scan once at the gate &middot; turn your brightness up</div>
      </td></tr>
    </table>
  </td></tr>
  @endforeach
</table>

{{-- ── Actions ──────────────────────────────────────────────────────── --}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" align="center" style="padding:30px 44px 6px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td class="tk-btn" bgcolor="#19E6CE" style="background-color:#19E6CE;background-image:linear-gradient(135deg,#19E6CE 0%,#19A1E6 100%);border-radius:14px;">
        <!--[if mso]><v:roundrect href="{{ $ticketsUrl }}" style="height:52px;width:280px;v-text-anchor:middle;" arcsize="25%" fillcolor="#19E6CE" stroke="f"><center style="color:#05070F;font-family:Arial;font-size:16px;font-weight:bold;">View tickets online</center></v:roundrect><![endif]-->
        <!--[if !mso]><!-->
        <a href="{{ $ticketsUrl }}" style="display:inline-block;padding:16px 34px;font-family:{{ $font }};font-size:16px;font-weight:800;color:#05070F;text-decoration:none;border-radius:14px;">
          View tickets online &rarr;
        </a>
        <!--<![endif]-->
      </td>
    </tr></table>
  </td></tr>
  <tr><td class="tk-pad" align="center" style="padding:12px 44px 0;font-family:{{ $font }};font-size:14px;">
    <a href="{{ $calendarUrl }}" style="color:#AEB9CE;text-decoration:none;font-weight:600;">&#128198; Add to Google Calendar</a>
    @if($event->location_map_link)
      <span style="color:#2A3A5C;">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
      <a href="{{ $event->location_map_link }}" style="color:#AEB9CE;text-decoration:none;font-weight:600;">&#129517; Directions</a>
    @endif
    <div style="margin-top:6px;font-size:12px;color:#5C6A85;">Apple &amp; Outlook: open the attached event.ics</div>
  </td></tr>
</table>

{{-- ── Receipt ──────────────────────────────────────────────────────── --}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:30px 44px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0E1729"
      style="background-color:#0E1729;border:1px solid #1C2740;border-radius:16px;">
      <tr><td style="padding:18px 20px 6px;font-family:{{ $font }};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#5C6A85;">Receipt</td>
          <td align="right" style="font-family:{{ $mono }};font-size:12px;color:#8A97B0;">{{ $order->reference }}</td>
        </tr></table>
      </td></tr>

      @foreach($order->items as $item)
      <tr><td style="padding:8px 20px;font-family:{{ $font }};font-size:14px;line-height:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#E6EDF7;">{{ $item->tier_name }} <span style="color:#5C6A85;">&times; {{ $item->quantity }}</span></td>
          <td align="right" style="color:#E6EDF7;white-space:nowrap;">{{ (float) $item->subtotal > 0 ? $money($item->subtotal) : 'Free' }}</td>
        </tr></table>
      </td></tr>
      @endforeach

      @if((float) $order->discount_amount > 0)
      <tr><td style="padding:8px 20px;font-family:{{ $font }};font-size:14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#19E6CE;">Discount</td>
          <td align="right" style="color:#19E6CE;white-space:nowrap;">&minus;{{ $money($order->discount_amount) }}</td>
        </tr></table>
      </td></tr>
      @endif

      @if((float) $order->fee_amount > 0)
      <tr><td style="padding:8px 20px;font-family:{{ $font }};font-size:14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#AEB9CE;">Booking fee</td>
          <td align="right" style="color:#AEB9CE;white-space:nowrap;">{{ $money($order->fee_amount) }}</td>
        </tr></table>
      </td></tr>
      @endif

      <tr><td style="padding:6px 20px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #1C2740;"><tr>
          <td style="padding-top:12px;font-family:{{ $font }};font-size:15px;font-weight:700;color:#FFFFFF;">{{ $free ? 'Total' : 'Total paid' }}</td>
          <td align="right" style="padding-top:12px;font-family:{{ $font }};font-size:20px;font-weight:800;color:#FFFFFF;white-space:nowrap;">{{ $free ? 'Free' : $money($order->total) }}</td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
</table>

{{-- ── Sign-off ─────────────────────────────────────────────────────── --}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:30px 44px 40px;font-family:{{ $font }};font-size:15px;line-height:24px;color:#AEB9CE;">
    {{ $signoff }}<br>
    <strong style="color:#FFFFFF;">{{ $event->host ?: config('app.name') }}</strong>
  </td></tr>
</table>
@endsection

@section('footer_note')
  Sent to {{ $order->buyer_email }} because you booked on Tikooh.
  Each QR code works once — don't share it publicly.
@endsection
