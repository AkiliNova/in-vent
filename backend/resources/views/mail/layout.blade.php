{{--
    Shared shell for every Tikooh email.

    Email clients are hostile to modern CSS: everything is tables + inline
    styles, gradients always sit on a solid bgcolor fallback, and nothing
    depends on <style> except progressive extras (dark-mode hints, mobile).
--}}
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>@yield('title', 'Tikooh')</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; width:100% !important; background:#05070F; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  a { color:#19E6CE; }
  .tk-btn:hover { filter:brightness(1.08); }
  @media (max-width:620px) {
    .tk-container { width:100% !important; }
    .tk-pad { padding-left:22px !important; padding-right:22px !important; }
    .tk-hero-title { font-size:28px !important; line-height:34px !important; }
    .tk-stack { display:block !important; width:100% !important; }
    .tk-stack-gap { padding-top:10px !important; padding-left:0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#05070F;">
{{-- Inbox preview line, hidden in the body. --}}
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#05070F;">
  @yield('preheader')&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#05070F"
  style="background-color:#05070F;background-image:radial-gradient(ellipse at top, #0E2A3A 0%, #05070F 55%);">
<tr><td align="center" style="padding:32px 12px 40px;">

  <table role="presentation" class="tk-container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">

    {{-- Wordmark --}}
    <tr><td align="center" style="padding:0 0 26px;">
      <a href="{{ rtrim((string) config('app.frontend_url'), '/') }}" style="text-decoration:none;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">
        tikooh<span style="color:#19E6CE;">.</span>
      </a>
    </td></tr>

    {{-- Card --}}
    <tr><td bgcolor="#0B1220" style="background-color:#0B1220;border:1px solid #1C2740;border-radius:24px;overflow:hidden;">
      {{-- Signature gradient bar --}}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td height="4" bgcolor="#19E6CE" style="height:4px;line-height:4px;font-size:0;background-color:#19E6CE;background-image:linear-gradient(90deg,#19E6CE 0%,#19A1E6 50%,#8B5CF6 100%);">&nbsp;</td></tr>
      </table>

      @yield('content')
    </td></tr>

    {{-- Footer --}}
    <tr><td align="center" class="tk-pad" style="padding:28px 40px 0;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;color:#5C6A85;">
      @yield('footer_note')
      <p style="margin:12px 0 0;">
        <a href="{{ rtrim((string) config('app.frontend_url'), '/') }}" style="color:#8A97B0;text-decoration:none;font-weight:600;">tikooh.com</a>
        &nbsp;·&nbsp; Events, tickets &amp; check-in
      </p>
      <p style="margin:6px 0 0;">Questions? Just reply to this email — a human reads it.</p>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>
