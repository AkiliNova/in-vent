@extends('mail.layout')

@php
    $font = 'Inter,Segoe UI,Helvetica,Arial,sans-serif';
    $image = null;
    if ($imagePath) {
        $image = str_starts_with($imagePath, 'http')
            ? $imagePath
            : \Illuminate\Support\Facades\Storage::disk('public')->url($imagePath);
    }
    // Escape first, then turn bare links into anchors and keep line breaks.
    $html = preg_replace(
        '~(https?://[^\s<]+[^\s<.,;:!?)\]])~i',
        '<a href="$1" style="color:#19E6CE;font-weight:600;">$1</a>',
        e($body)
    );
    $paragraphs = array_filter(preg_split("/\R{2,}/", $html), fn ($p) => trim($p) !== '');
    $button = function (string $url, string $label) use ($font) {
        return '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
            .'<td bgcolor="#19E6CE" style="background-color:#19E6CE;background-image:linear-gradient(135deg,#19E6CE 0%,#19A1E6 100%);border-radius:14px;">'
            .'<a href="'.e($url).'" style="display:inline-block;padding:15px 30px;font-family:'.$font.';font-size:16px;font-weight:800;color:#05070F;text-decoration:none;border-radius:14px;">'
            .e($label).' &rarr;</a></td></tr></table>';
    };
@endphp

@section('title', $subjectLine)
@section('preheader', \Illuminate\Support\Str::limit(preg_replace('/\s+/', ' ', $body), 110))

@section('content')
@if($image)
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:0;">
    <img src="{{ $image }}" width="600" alt="" style="width:100%;max-width:600px;height:auto;display:block;">
  </td></tr>
</table>
@endif

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:36px 44px 8px;font-family:{{ $font }};">
    <h1 class="tk-hero-title" style="margin:0 0 18px;font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.6px;color:#FFFFFF;">{{ $subjectLine }}</h1>
    @foreach($paragraphs as $p)
      <p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#C9D3E3;">{!! nl2br($p) !!}</p>
    @endforeach
  </td></tr>
</table>

{{-- ── Featured event ───────────────────────────────────────────────── --}}
@if($event)
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:12px 44px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0E1729"
      style="background-color:#0E1729;border:1px solid #23406A;border-radius:20px;overflow:hidden;">
      @if($event->cover_url)
      <tr><td style="padding:0;">
        <a href="{{ $eventUrl }}"><img src="{{ $event->cover_url }}" width="510" alt="{{ $event->title }}" style="width:100%;height:auto;max-height:260px;object-fit:cover;display:block;"></a>
      </td></tr>
      @endif
      <tr><td style="padding:22px 24px 24px;font-family:{{ $font }};">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#7FF5E8;">&#10022;&nbsp; Don't miss it</div>
        <div style="margin-top:6px;font-size:22px;line-height:28px;font-weight:800;color:#FFFFFF;">{{ $event->title }}</div>
        <div style="margin-top:10px;font-size:14px;line-height:22px;color:#AEB9CE;">
          @if($eventStarts)&#128197;&nbsp; {{ $eventStarts->format('l j F · g:ia') }}<br>@endif
          &#128205;&nbsp; {{ $event->location_name ?: 'Venue to be announced' }}{{ $event->city ? ', '.$event->city : '' }}
          @if($eventFrom)<br>&#127903;&nbsp; <strong style="color:#FFFFFF;">{{ $eventFrom }}</strong>@endif
        </div>
        <div style="margin-top:20px;">{!! $button($eventUrl, 'Get tickets') !!}</div>
      </td></tr>
    </table>
  </td></tr>
</table>
@endif

@if(!empty($phoneUrl))
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:22px 44px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #23406A;border-radius:18px;background:#0E1729;">
      <tr><td align="center" style="padding:24px 22px;font-family:{{ $font }};">
        <div style="font-size:30px;line-height:34px;">&#128241;</div>
        <div style="margin-top:8px;font-size:18px;line-height:24px;font-weight:800;color:#FFFFFF;">Add your phone number</div>
        <div style="margin-top:6px;font-size:14px;line-height:21px;color:#AEB9CE;">So we can text you your tickets and important event updates. It takes 10 seconds.</div>
        <div style="margin-top:18px;">{!! $button($phoneUrl, 'Add my phone number') !!}</div>
        <div style="margin-top:12px;font-size:12px;line-height:18px;color:#5C6A85;">This link is just for you. Please don't forward this email.</div>
      </td></tr>
    </table>
  </td></tr>
</table>
@endif

@if($ctaUrl && $ctaLabel)
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" align="center" style="padding:26px 44px 4px;">{!! $button($ctaUrl, $ctaLabel) !!}</td></tr>
</table>
@endif

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td class="tk-pad" style="padding:28px 44px 40px;font-family:{{ $font }};font-size:15px;line-height:24px;color:#AEB9CE;">
    — <strong style="color:#FFFFFF;">{{ $senderName }}</strong>
  </td></tr>
</table>
@endsection

@section('footer_note')
  You're getting this because you've booked or attended an event with {{ $senderName }}.
  @if($unsubscribeUrl)
    <br><a href="{{ $unsubscribeUrl }}" style="color:#8A97B0;text-decoration:underline;">Unsubscribe</a> — one click, no questions.
  @endif
@endsection
