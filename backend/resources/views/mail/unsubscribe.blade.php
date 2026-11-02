<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{ $done ? 'Unsubscribed' : 'Unsubscribe' }} · Tikooh</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
    font-family: Inter, Segoe UI, Helvetica, Arial, sans-serif; color:#E6EDF7;
    background:#05070F radial-gradient(ellipse at top, #0E2A3A 0%, #05070F 60%); }
  .card { width:100%; max-width:440px; background:#0B1220; border:1px solid #1C2740; border-radius:24px; overflow:hidden; text-align:center; }
  .bar { height:4px; background:linear-gradient(90deg,#19E6CE,#19A1E6 50%,#8B5CF6); }
  .inner { padding:36px 32px 32px; }
  .logo { font-size:22px; font-weight:800; color:#fff; letter-spacing:-0.5px; }
  .logo span { color:#19E6CE; }
  h1 { margin:22px 0 8px; font-size:24px; }
  p { margin:0; color:#AEB9CE; line-height:1.6; }
  button { margin-top:24px; border:0; cursor:pointer; padding:14px 28px; border-radius:14px; font:800 16px Inter, Segoe UI, Arial, sans-serif;
    color:#05070F; background:linear-gradient(135deg,#19E6CE,#19A1E6); }
  .tick { width:64px; height:64px; margin:22px auto 0; border-radius:50%; display:flex; align-items:center; justify-content:center;
    background:rgba(25,230,206,.12); color:#19E6CE; font-size:30px; }
</style>
</head>
<body>
  <div class="card">
    <div class="bar"></div>
    <div class="inner">
      <div class="logo">tikooh<span>.</span></div>
      @if($done)
        <div class="tick">&#10003;</div>
        <h1>You're unsubscribed</h1>
        <p>You won't get any more emails from <strong>{{ $sender }}</strong>. Tickets you book will still be emailed to you.</p>
      @else
        <h1>Unsubscribe?</h1>
        <p>Stop marketing emails from <strong>{{ $sender }}</strong>. Your ticket confirmations are not affected.</p>
        <form method="post">
          <button type="submit">Yes, unsubscribe me</button>
        </form>
      @endif
    </div>
  </div>
</body>
</html>
