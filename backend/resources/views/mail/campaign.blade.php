@extends('mail.layout')

@php
    $font = 'Inter,Segoe UI,Helvetica,Arial,sans-serif';
    $image = null;
    if ($imagePath) {
        $image = \Illuminate\Support\Facades\Storage::url($imagePath);
        $image = str_starts_with($image, 'http') ? $image : url($image);
    }
@endphp

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
  <tr><td class="tk-pad" style="padding:36px 44px 40px;font-family:{{ $font }};font-size:16px;line-height:26px;color:#D5DEEC;">
    {!! nl2br(e($body)) !!}
  </td></tr>
</table>
@endsection
