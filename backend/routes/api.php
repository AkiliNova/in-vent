<?php

use App\Http\Controllers\Api\AccommodationController;
use App\Http\Controllers\Api\AgendaController;
use App\Http\Controllers\Api\AttendeeController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BadgeController;
use App\Http\Controllers\Api\BlogController;
use App\Http\Controllers\Api\CampaignController;
use App\Http\Controllers\Api\ChatbotController;
use App\Http\Controllers\Api\CheckInController;
use App\Http\Controllers\Api\CheckoutController;
use App\Http\Controllers\Api\DarajaCallbackController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EngagementController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\EventSettingsController;
use App\Http\Controllers\Api\ExhibitorController;
use App\Http\Controllers\Api\FeedbackController;
use App\Http\Controllers\Api\FloorPlanController;
use App\Http\Controllers\Api\MerchantController;
use App\Http\Controllers\Api\NetworkingController;
use App\Http\Controllers\Api\PaymentWebhookController;
use App\Http\Controllers\Api\TelegramWebhookController;
use App\Http\Controllers\Api\VenueController;
use App\Http\Controllers\Api\WalletController;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public — no authentication
|--------------------------------------------------------------------------
| Buyers and attendees are anonymous until they sign in. Everything here
| resolves records by uuid and exposes only publicly-safe fields.
*/

Route::post('auth/register', [AuthController::class, 'register'])->middleware('throttle:6,1');
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

Route::prefix('public')->group(function () {
    Route::get('events', [EventController::class, 'publicIndex']);
    Route::get('events/{uuid}', [EventController::class, 'publicShow']);

    // Registration and checkout
    Route::post('events/{uuid}/register', [AttendeeController::class, 'register'])->middleware('throttle:10,1');
    Route::post('events/{uuid}/waitlist', [EventSettingsController::class, 'joinWaitlist'])->middleware('throttle:10,1');
    Route::post('events/{uuid}/promo-check', [CheckoutController::class, 'checkPromo'])->middleware('throttle:20,1');
    Route::post('events/{uuid}/orders', [CheckoutController::class, 'createOrder'])->middleware('throttle:10,1');
    Route::post('orders/{reference}/pay/pesapal', [CheckoutController::class, 'payWithPesapal'])->middleware('throttle:10,1');
    Route::post('orders/{reference}/pay/mpesa', [CheckoutController::class, 'payWithMpesa'])->middleware('throttle:10,1');
    Route::get('orders/{reference}', [CheckoutController::class, 'status']);
    Route::post('my-tickets', [CheckoutController::class, 'myTickets'])->middleware('throttle:10,1');

    // Live engagement — guests can vote and ask via X-Guest-Token.
    Route::get('events/{uuid}/polls', [EngagementController::class, 'livePolls']);
    Route::post('events/{uuid}/polls/{poll}/vote', [EngagementController::class, 'vote'])->middleware('throttle:30,1');
    Route::get('events/{uuid}/questions', [EngagementController::class, 'listQuestions']);
    Route::post('events/{uuid}/questions', [EngagementController::class, 'askQuestion'])->middleware('throttle:10,1');
    Route::post('events/{uuid}/questions/{question}/upvote', [EngagementController::class, 'upvoteQuestion'])->middleware('throttle:60,1');

    // Feedback pop-ups
    Route::get('events/{uuid}/feedback/due', [FeedbackController::class, 'due']);
    Route::post('events/{uuid}/feedback/{form}', [FeedbackController::class, 'submit'])->middleware('throttle:10,1');

    // Chatbot
    Route::post('events/{uuid}/chat', [ChatbotController::class, 'ask'])->middleware('throttle:20,1');
    Route::get('events/{uuid}/chat/history', [ChatbotController::class, 'history']);
    Route::post('chat/messages/{message}/rate', [ChatbotController::class, 'rate']);

    Route::post('unsubscribe', [CampaignController::class, 'unsubscribe'])->middleware('throttle:10,1');

    // Blog
    Route::get('blog', [BlogController::class, 'publicIndex']);
    Route::get('blog/{slug}', [BlogController::class, 'publicShow']);
});

/*
|--------------------------------------------------------------------------
| Provider webhooks — unauthenticated by nature, verified inside
|--------------------------------------------------------------------------
*/

Route::post('webhooks/pesapal', [PaymentWebhookController::class, 'pesapal'])->name('webhooks.pesapal');
Route::post('webhooks/mpesa', [PaymentWebhookController::class, 'mpesa'])->name('webhooks.mpesa');

Route::post('webhooks/telegram', TelegramWebhookController::class)->name('webhooks.telegram')->middleware('throttle:60,1');

// Registered with Safaricom, which rejects any URL containing "mpesa" — hence "daraja".
Route::prefix('webhooks/daraja')->withoutMiddleware(ThrottleRequests::class.':api')->group(function () {
    Route::post('c2b/{token}/validate', [DarajaCallbackController::class, 'c2bValidate'])->name('webhooks.daraja.c2b.validate');
    Route::post('c2b/{token}/confirm', [DarajaCallbackController::class, 'c2bConfirm'])->name('webhooks.daraja.c2b.confirm');
    Route::post('b2c/{token}/result', [DarajaCallbackController::class, 'b2cResult'])->name('webhooks.daraja.b2c.result');
    Route::post('b2c/{token}/timeout', [DarajaCallbackController::class, 'b2cTimeout'])->name('webhooks.daraja.b2c.timeout');
});

/*
|--------------------------------------------------------------------------
| Authenticated
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->group(function () {
    // ── Account ─────────────────────────────────────────────────────────────
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::post('auth/logout-all', [AuthController::class, 'logoutAll']);
    Route::post('auth/password', [AuthController::class, 'changePassword']);

    // ── Attendee-facing (mobile app, feature 14) ────────────────────────────
    Route::prefix('me/events/{uuid}')->group(function () {
        Route::get('directory', [NetworkingController::class, 'directory']);
        Route::put('profile', [NetworkingController::class, 'updateProfile']);
        Route::post('connections', [NetworkingController::class, 'connect']);
        Route::get('connections', [NetworkingController::class, 'myConnections']);
        Route::post('connections/{connection}/respond', [NetworkingController::class, 'respondToConnection']);
        Route::post('meetings', [NetworkingController::class, 'proposeMeeting']);
        Route::get('meetings', [NetworkingController::class, 'myMeetings']);
        Route::post('meetings/{meeting}/respond', [NetworkingController::class, 'respondToMeeting']);
        Route::get('conversations', [NetworkingController::class, 'conversations']);
        Route::post('conversations/messages', [NetworkingController::class, 'sendMessage']);
        Route::get('conversations/{conversation}/messages', [NetworkingController::class, 'messages']);
    });

    // ── Venue directory (feature 3) ─────────────────────────────────────────
    Route::get('venues', [VenueController::class, 'index']);
    Route::get('venues/{venue}', [VenueController::class, 'show']);
    Route::post('venues/{venue}/reviews', [VenueController::class, 'review']);

    // ── Organizer ───────────────────────────────────────────────────────────
    Route::middleware('role:organizer,staff')->group(function () {
        Route::get('dashboard', [DashboardController::class, 'overview']);

        Route::get('events', [EventController::class, 'index']);
        Route::get('events/{event}', [EventController::class, 'show']);

        Route::prefix('events/{event}')->middleware('owns.event')->group(function () {
            // Agenda (feature 5)
            Route::get('sessions', [AgendaController::class, 'sessions']);
            Route::get('speakers', [AgendaController::class, 'speakers']);
            Route::get('my-agenda', [AgendaController::class, 'myAgenda']);
            Route::post('sessions/{session}/favourite', [AgendaController::class, 'toggleFavourite']);

            // Attendees
            Route::get('attendees', [AttendeeController::class, 'index']);
            Route::get('attendees/export', [AttendeeController::class, 'export']);

            // Check-in (features 6, 15)
            Route::post('check-in/scan', [CheckInController::class, 'scan']);
            Route::post('check-in/sync', [CheckInController::class, 'syncOffline']);
            Route::get('check-in/stats', [CheckInController::class, 'stats']);
            Route::post('check-in/nfc', [CheckInController::class, 'assignNfc']);

            // Badges (feature 11)
            Route::get('badge-templates', [BadgeController::class, 'templates']);
            Route::post('attendees/{attendee}/badge', [BadgeController::class, 'generate']);

            // Lead capture (feature 9) — booth staff scan here
            Route::post('exhibitors/{exhibitor}/leads', [ExhibitorController::class, 'captureLead']);
            Route::get('exhibitors/{exhibitor}/leads', [ExhibitorController::class, 'leads']);

            // Live moderation (feature 7)
            Route::get('questions/queue', [EngagementController::class, 'moderationQueue']);
            Route::post('questions/{question}/moderate', [EngagementController::class, 'moderateQuestion']);
            Route::get('polls', [EngagementController::class, 'listPolls']);
            Route::post('polls/{poll}/open', [EngagementController::class, 'openPoll']);
            Route::post('polls/{poll}/close', [EngagementController::class, 'closePoll']);
            Route::get('polls/{poll}/results', [EngagementController::class, 'pollResults']);
        });

        Route::get('badges/{badge}/download', [BadgeController::class, 'download'])->name('badges.download');
        Route::get('badge-batches/{key}', [BadgeController::class, 'batchStatus']);
        Route::get('badge-batches/{key}/download', [BadgeController::class, 'downloadBatch']);
    });

    // ── Organizer only (destructive / configuration) ────────────────────────
    Route::middleware('role:organizer')->group(function () {
        Route::post('events', [EventController::class, 'store']);
        Route::put('events/{event}', [EventController::class, 'update']);
        Route::delete('events/{event}', [EventController::class, 'destroy']);
        Route::post('events/{event}/publish', [EventController::class, 'publish']);
        Route::post('events/{event}/cover', [EventController::class, 'uploadCover']);

        Route::post('venues', [VenueController::class, 'store']);
        Route::put('venues/{venue}', [VenueController::class, 'update']);
        Route::post('venues/{venue}/spaces', [VenueController::class, 'storeSpace']);
        Route::delete('venues/{venue}/spaces/{space}', [VenueController::class, 'destroySpace']);

        Route::prefix('events/{event}')->middleware('owns.event')->group(function () {
            // Ticketing and the registration form
            Route::get('tiers', [EventSettingsController::class, 'tiers']);
            Route::post('tiers', [EventSettingsController::class, 'storeTier']);
            Route::put('tiers/{tier}', [EventSettingsController::class, 'updateTier']);
            Route::delete('tiers/{tier}', [EventSettingsController::class, 'destroyTier']);
            Route::get('fields', [EventSettingsController::class, 'fields']);
            Route::put('fields', [EventSettingsController::class, 'saveFields']);
            Route::get('promo-codes', [EventSettingsController::class, 'promoCodes']);
            Route::post('promo-codes', [EventSettingsController::class, 'storePromoCode']);
            Route::put('promo-codes/{promoCode}', [EventSettingsController::class, 'updatePromoCode']);
            Route::get('waitlist', [EventSettingsController::class, 'waitlist']);

            // Attendees
            Route::post('attendees', [AttendeeController::class, 'store']);
            Route::put('attendees/{attendee}', [AttendeeController::class, 'update']);
            Route::delete('attendees/{attendee}', [AttendeeController::class, 'destroy']);

            // Agenda
            Route::post('sessions', [AgendaController::class, 'storeSession']);
            Route::put('sessions/{session}', [AgendaController::class, 'updateSession']);
            Route::delete('sessions/{session}', [AgendaController::class, 'destroySession']);
            Route::post('speakers', [AgendaController::class, 'storeSpeaker']);
            Route::put('speakers/{speaker}', [AgendaController::class, 'updateSpeaker']);
            Route::delete('speakers/{speaker}', [AgendaController::class, 'destroySpeaker']);

            // Exhibitors and booths (feature 5)
            Route::get('exhibitors', [ExhibitorController::class, 'index']);
            Route::post('exhibitors', [ExhibitorController::class, 'store']);
            Route::put('exhibitors/{exhibitor}', [ExhibitorController::class, 'update']);
            Route::post('exhibitors/{exhibitor}/staff', [ExhibitorController::class, 'storeStaff']);
            Route::get('exhibitors/{exhibitor}/leads/export', [ExhibitorController::class, 'exportLeads']);
            Route::get('booths', [ExhibitorController::class, 'booths']);
            Route::post('booths', [ExhibitorController::class, 'storeBooth']);
            Route::post('booths/{booth}/assign', [ExhibitorController::class, 'assignBooth']);

            // Venue diagramming (feature 4)
            Route::get('floor-plans', [FloorPlanController::class, 'index']);
            Route::post('floor-plans', [FloorPlanController::class, 'store']);
            Route::get('floor-plans/{plan}', [FloorPlanController::class, 'show']);
            Route::put('floor-plans/{plan}/items', [FloorPlanController::class, 'saveItems']);
            Route::post('floor-plans/{plan}/publish', [FloorPlanController::class, 'publish']);
            Route::post('floor-plans/{plan}/seats', [FloorPlanController::class, 'assignSeat']);
            Route::post('floor-plans/{plan}/auto-seat', [FloorPlanController::class, 'autoSeat']);
            Route::delete('seats/{assignment}', [FloorPlanController::class, 'releaseSeat']);

            // Badges (feature 11)
            Route::post('badge-templates', [BadgeController::class, 'storeTemplate']);
            Route::put('badge-templates/{template}', [BadgeController::class, 'updateTemplate']);
            Route::post('badges/batch', [BadgeController::class, 'generateBatch']);

            // Engagement (feature 7)
            Route::post('polls', [EngagementController::class, 'createPoll']);

            // Feedback (feature 8)
            Route::get('feedback-forms', [FeedbackController::class, 'index']);
            Route::post('feedback-forms', [FeedbackController::class, 'store']);
            Route::get('feedback-forms/{form}/results', [FeedbackController::class, 'results']);

            // Dignitaries and rooms (feature 10)
            Route::get('dignitaries', [AccommodationController::class, 'dignitaries']);
            Route::post('dignitaries', [AccommodationController::class, 'storeDignitary']);
            Route::put('dignitaries/{dignitary}', [AccommodationController::class, 'updateDignitary']);
            Route::get('accommodations', [AccommodationController::class, 'accommodations']);
            Route::post('accommodations', [AccommodationController::class, 'storeAccommodation']);
            Route::post('accommodations/{accommodation}/rooms', [AccommodationController::class, 'storeRooms']);
            Route::get('rooms/available', [AccommodationController::class, 'availableRooms']);
            Route::get('allocations', [AccommodationController::class, 'allocations']);
            Route::post('allocations', [AccommodationController::class, 'allocate']);
            Route::delete('allocations/{allocation}', [AccommodationController::class, 'releaseAllocation']);
            Route::get('rooming-list', [AccommodationController::class, 'roomingList']);

            // Chatbot knowledge (feature 12)
            Route::get('chatbot/knowledge', [ChatbotController::class, 'knowledge']);
            Route::post('chatbot/knowledge', [ChatbotController::class, 'storeKnowledge']);
            Route::delete('chatbot/knowledge/{knowledge}', [ChatbotController::class, 'destroyKnowledge']);
            Route::get('chatbot/escalations', [ChatbotController::class, 'escalations']);

            // Reporting
            Route::get('report', [DashboardController::class, 'event']);
        });

        // Merchant profile, payouts and wallet
        Route::get('merchant', [MerchantController::class, 'show']);
        Route::put('merchant', [MerchantController::class, 'update']);
        Route::put('merchant/payout', [MerchantController::class, 'updatePayout'])->middleware('throttle:5,1');
        Route::get('wallet', [WalletController::class, 'show']);
        Route::post('wallet/withdraw', [WalletController::class, 'withdraw'])->middleware('throttle:5,1');
        Route::post('wallet/withdrawals/{payout}/cancel', [WalletController::class, 'cancel']);

        // Campaigns (feature 2)
        Route::get('campaigns', [CampaignController::class, 'index']);
        Route::post('campaigns', [CampaignController::class, 'store']);
        Route::put('campaigns/{campaign}', [CampaignController::class, 'update']);
        Route::get('campaigns/{campaign}/preview', [CampaignController::class, 'preview']);
        Route::post('campaigns/{campaign}/send', [CampaignController::class, 'send']);
        Route::post('campaigns/{campaign}/schedule', [CampaignController::class, 'schedule']);
        Route::post('campaigns/{campaign}/cancel', [CampaignController::class, 'cancel']);
        Route::get('campaigns/{campaign}/report', [CampaignController::class, 'report']);
    });

    // ── Platform staff ──────────────────────────────────────────────────────
    Route::middleware('role:super_admin')->prefix('admin')->group(function () {
        Route::get('overview', [DashboardController::class, 'platform']);
        Route::get('payments/unmatched', [WalletController::class, 'unmatchedC2b']);
        Route::get('payouts/pending', [WalletController::class, 'pendingPayouts']);
        Route::get('payouts', [WalletController::class, 'adminPayouts']);

        Route::get('blog', [BlogController::class, 'index']);
        Route::post('blog', [BlogController::class, 'store']);
        Route::put('blog/{post:id}', [BlogController::class, 'update']);
        Route::post('blog/{post:id}/cover', [BlogController::class, 'uploadCover']);
        Route::delete('blog/{post:id}', [BlogController::class, 'destroy']);
        Route::post('payouts/{payout}/approve', [WalletController::class, 'approve']);
        Route::post('payouts/{payout}/mark-paid', [WalletController::class, 'markPaid']);
        Route::post('payouts/{payout}/reject', [WalletController::class, 'reject']);
    });
});
