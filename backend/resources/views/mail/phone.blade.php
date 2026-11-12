<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{ $done ? 'Phone number saved' : 'Add your phone number' }} · Tikooh</title>
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
  form { margin-top:22px; text-align:left; }
  label { display:block; font-size:13px; color:#AEB9CE; margin-bottom:6px; }
  input { width:100%; padding:14px 16px; border-radius:14px; border:1px solid #23406A; background:#0E1729; color:#fff;
    font:600 18px Inter, Segoe UI, Arial, sans-serif; letter-spacing:.5px; outline:none; }
  input:focus { border-color:#19E6CE; box-shadow:0 0 0 3px rgba(25,230,206,.15); }
  .err { margin-top:8px; color:#FF6B81; font-size:13px; }
  button { width:100%; margin-top:16px; border:0; cursor:pointer; padding:15px 28px; border-radius:14px; font:800 16px Inter, Segoe UI, Arial, sans-serif;
    color:#05070F; background:linear-gradient(135deg,#19E6CE,#19A1E6); }
  .fine { margin-top:14px; font-size:12px; color:#5C6A85; text-align:center; }
  .tick { width:64px; height:64px; margin:22px auto 0; border-radius:50%; display:flex; align-items:center; justify-content:center;
    background:rgba(25,230,206,.12); color:#19E6CE; font-size:30px; }
  .num { margin-top:10px; font:700 18px Inter, Segoe UI, Arial, sans-serif; color:#fff; letter-spacing:.5px; }
</style>
</head>
<body>
  <div class="card">
    <div class="bar"></div>
    <div class="inner">
      <div class="logo">tikooh<span>.</span></div>
      @if($done)
        <div class="tick">&#10003;</div>
        <h1>Thank you{{ $name ? ', '.$name : '' }}!</h1>
        <p>We'll text your tickets and event updates to</p>
        <div class="num">{{ $value }}</div>
        <p class="fine">Wrong number? Open the link in the email again to change it.</p>
      @else
        <h1>Add your phone number</h1>
        <p>{{ $name ? 'Hi '.$name.'. ' : '' }}<strong>{{ $sender }}</strong> will text your tickets and important event updates here.</p>
        @if($already)
          <p class="fine">You've already added a number. Saving again will replace it.</p>
        @endif
        <form method="post" novalidate>
          <label for="phone">Mobile number</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0712 345 678" value="{{ $value }}" required autofocus>
          @if($error)<div class="err">{{ $error }}</div>@endif
          <button type="submit">Save my number</button>
        </form>
        <p class="fine">Only used for your tickets and updates from this organiser. Never shared or sold.</p>
      @endif
    </div>
  </div>
</body>
</html>
