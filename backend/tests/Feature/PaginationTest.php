<?php

namespace Tests\Feature;

use App\Models\Payout;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WalletEntry;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PaginationTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $acme;

    protected User $organiser;

    protected function setUp(): void
    {
        parent::setUp();

        TenantContext::withoutScoping(function () {
            $this->acme = Tenant::create(['organization_name' => 'Acme Live', 'slug' => 'acme', 'email' => 'a@acme.com']);
            $this->organiser = User::create(['tenant_id' => $this->acme->id, 'name' => 'Owner', 'email' => 'owner@acme.com', 'password' => 'password123', 'role' => User::ROLE_ORGANIZER]);

            foreach (range(1, 130) as $i) {
                WalletEntry::create(['tenant_id' => $this->acme->id, 'type' => WalletEntry::SALE, 'amount' => 10, 'currency' => 'KES', 'description' => "Sale {$i}"]);
            }
        });

        Sanctum::actingAs($this->organiser);
    }

    public function test_per_page_is_capped_so_no_list_comes_back_whole(): void
    {
        $this->getJson('/api/wallet/entries?per_page=100000')
            ->assertOk()
            ->assertJsonCount(100, 'data')
            ->assertJsonPath('per_page', 100)
            ->assertJsonPath('total', 130);

        $this->getJson('/api/wallet/entries?per_page=0&page=-3')->assertOk()->assertJsonPath('current_page', 1)->assertJsonPath('per_page', 1);
    }

    public function test_wallet_history_reaches_the_oldest_entry(): void
    {
        $wallet = $this->getJson('/api/wallet')->assertOk();
        $this->assertCount(25, $wallet->json('entries'));
        $wallet->assertJsonPath('entries_total', 130);

        $last = $this->getJson('/api/wallet/entries?per_page=25&page=6')->assertOk();
        $last->assertJsonCount(5, 'data')->assertJsonPath('last_page', 6);
        $this->assertSame('Sale 1', $last->json('data.4.description'), 'oldest entry is on the last page');
    }

    public function test_withdrawals_are_paginated_with_masked_numbers(): void
    {
        TenantContext::withoutScoping(fn () => Payout::create([
            'tenant_id' => $this->acme->id, 'gross_amount' => 500, 'fee_amount' => 0, 'net_amount' => 500, 'currency' => 'KES', 'destination_account' => '254712345678', 'status' => 'paid',
        ]));

        $r = $this->getJson('/api/wallet/withdrawals')->assertOk()->assertJsonPath('total', 1);
        $this->assertStringNotContainsString('2345', $r->json('data.0.destination_account'));
    }
}
