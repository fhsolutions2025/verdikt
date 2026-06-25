// ============================================================
// Shared types — mirrors TECH_SPEC.md §3 schema exactly.
// Hand-written until supabase gen types is run.
// ============================================================

export type UserRole      = 'admin' | 'player'
export type BundleStatus  = 'draft' | 'live' | 'resolved' | 'voided'
export type MarketCategory = 'sports' | 'finance' | 'politics' | 'current_affairs' | 'custom'
export type FeeCategory   = 'sports' | 'finance' | 'politics' | 'current_affairs' | 'custom' | 'user_created' | 'bundle'
export type MarketStatus  = 'pending_ai' | 'ai_ready' | 'pending_mm_review' | 'pending_compliance' | 'live' | 'resolved' | 'voided'
export type CreatorType   = 'institutional_mm' | 'player_mm' | 'ai_system'
export type MarketOutcome = 'yes' | 'no' | 'void'
export type OrderSide     = 'yes' | 'no'
export type OrderStatus   = 'open' | 'partially_filled' | 'filled' | 'cancelled'
export type PositionStatus = 'open' | 'sold' | 'resolved_won' | 'resolved_lost' | 'voided'
export type TransactionType = 'deposit' | 'withdrawal' | 'trade' | 'sell' | 'payout' | 'fee' | 'maker_rebate' | 'maker_spread' | 'holding_reward' | 'creator_royalty'
export type AuditType     = 'trade' | 'seed' | 'resolve' | 'fee' | 'operator_sync' | 'config_change' | 'market_submission' | 'risk_alert'

export interface Profile {
  id:           string
  role:         UserRole
  display_name: string
  operator_id:  string | null
  created_at:   string
}

export interface Operator {
  id:                 string
  name:               string
  revenue_share_pct:  number
  created_at:         string
}

export interface Bundle {
  id:         string
  name:       string
  category:   string
  closes_at:  string
  status:     BundleStatus
  created_at: string
}

export interface Market {
  id:                       string
  question:                 string
  category:                 MarketCategory
  fee_category:             FeeCategory
  bundle_id:                string | null
  yes_price:                number
  no_price:                 number
  ai_confidence:            number | null
  status:                   MarketStatus
  resolution_source:        string | null
  closes_at:                string
  resolved_at:              string | null
  outcome:                  MarketOutcome | null
  volume:                   number
  est_volume:               number | null
  spread_cents:             number
  created_by:               string | null
  creator_type:             CreatorType
  created_at:               string
  updated_at:               string
  player_original_question: string | null
  rejection_reason:         string | null
}

export interface PriceTick {
  id:          number
  market_id:   string
  price:       number
  recorded_at: string
}

export interface Order {
  id:            string
  market_id:     string
  maker_id:      string | null
  side:          OrderSide
  price:         number
  shares:        number
  shares_filled: number
  status:        OrderStatus
  created_at:    string
  updated_at:    string
}

export interface Trade {
  id:                    string
  market_id:             string
  taker_id:              string | null
  maker_order_id:        string | null
  side:                  OrderSide
  price:                 number
  shares:                number
  amount:                number
  fee:                   number
  platform_fee_share:    number
  maker_rebate_share:    number
  is_simulated:          boolean
  simulated_trader_name: string | null
  created_at:            string
}

export interface Position {
  id:          string
  player_id:   string
  market_id:   string
  side:        OrderSide
  shares:      number
  entry_price: number
  entry_value: number
  entry_at:    string
  fee_paid:    number
  status:      PositionStatus
  closed_at:   string | null
  realized_pnl: number | null
}

export interface Wallet {
  id:         string
  player_id:  string
  balance:    number
  updated_at: string
}

export interface WalletTransaction {
  id:                 string
  wallet_id:          string
  type:               TransactionType
  amount:             number
  related_market_id:  string | null
  related_trade_id:   string | null
  description:        string
  created_at:         string
}

export interface FeeConfig {
  id:                  string
  category:            FeeCategory
  taker_fee_pct:       number
  maker_rebate_pct:    number
  creator_royalty_pct: number
  updated_at:          string
  updated_by:          string | null
}

export interface MmConfig {
  id:                      string
  is_verdikt_acting_as_mm: boolean
  risk_capacity:           number
  margin_pct:              number
  updated_at:              string
}

export interface RiskMarket extends Market {
  is_imbalanced: boolean
  risk_tier:     'green' | 'orange'
}

export interface ApiSource {
  id:                    string
  name:                  string
  category:              string
  license_tier:          string
  commercial_note:       string | null
  rate_limit_per_minute: number | null
  created_at:            string
}

export interface ApiRateLimit {
  api_name:     string
  window_start: string
  call_count:   number
}

export interface AiCallLog {
  id:                string
  call_type:         string
  model:             string
  input_tokens:      number | null
  output_tokens:     number | null
  latency_ms:        number | null
  success:           boolean
  from_cache:        boolean
  error_message:     string | null
  related_market_id: string | null
  created_at:        string
}

export interface AuditLogEntry {
  id:          string
  type:        AuditType
  description: string
  amount:      number | null
  fee:         number | null
  market_id:   string | null
  actor_id:    string | null
  created_at:  string
}

export interface PlatformTotals {
  total_volume:        number
  total_platform_fees: number
  total_maker_rebates: number
}

export interface OperatorRevenue {
  id:                string
  name:              string
  revenue_share_pct: number
  volume:            number
  fees:              number
}

// ─── Supabase Database type (used by typed client) ─────────
export type Database = {
  public: {
    Tables: {
      profiles:            { Row: Profile;            Insert: Omit<Profile, 'created_at'>;            Update: Partial<Profile> }
      operators:           { Row: Operator;           Insert: Omit<Operator, 'id' | 'created_at'>;   Update: Partial<Operator> }
      bundles:             { Row: Bundle;             Insert: Omit<Bundle, 'id' | 'created_at'>;     Update: Partial<Bundle> }
      markets:             { Row: Market;             Insert: Omit<Market, 'id' | 'no_price' | 'created_at' | 'updated_at'>; Update: Partial<Market> }
      price_ticks:         { Row: PriceTick;          Insert: Omit<PriceTick, 'id' | 'recorded_at'>; Update: Partial<PriceTick> }
      orders:              { Row: Order;              Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Order> }
      trades:              { Row: Trade;              Insert: Omit<Trade, 'id' | 'created_at'>;      Update: Partial<Trade> }
      positions:           { Row: Position;           Insert: Omit<Position, 'id' | 'entry_at'>;     Update: Partial<Position> }
      wallets:             { Row: Wallet;             Insert: Omit<Wallet, 'id' | 'updated_at'>;     Update: Partial<Wallet> }
      wallet_transactions: { Row: WalletTransaction;  Insert: Omit<WalletTransaction, 'id' | 'created_at'>; Update: Partial<WalletTransaction> }
      fee_config:          { Row: FeeConfig;          Insert: Omit<FeeConfig, 'id'>;                 Update: Partial<FeeConfig> }
      mm_config:           { Row: MmConfig;           Insert: Omit<MmConfig, 'id' | 'updated_at'>;  Update: Partial<MmConfig> }
      audit_log:           { Row: AuditLogEntry;      Insert: Omit<AuditLogEntry, 'id' | 'created_at'>; Update: never }
    }
    Views: {
      v_platform_totals:    { Row: PlatformTotals }
      v_operator_revenue:   { Row: OperatorRevenue }
      v_market_risk_status: { Row: RiskMarket }
    }
    Functions: {
      execute_trade:      { Args: { p_market_id: string; p_taker_id: string | null; p_side: OrderSide; p_amount: number; p_is_simulated?: boolean; p_simulated_trader_name?: string }; Returns: { trade_id: string; shares: number; fee: number; total_cost: number; new_yes_price: number; new_no_price: number } }
      seed_market:        { Args: { p_market_id: string; p_maker_id: string | null; p_yes_shares: number; p_no_shares: number; p_spread_cents: number }; Returns: { status: MarketStatus; capital_deployed: number; capital_at_risk: number } }
      approve_ai_market:  { Args: { p_market_id: string; p_mm_id: string }; Returns: { status: MarketStatus; capital_deployed: number; capital_at_risk: number } }
      resolve_market:     { Args: { p_market_id: string; p_outcome: MarketOutcome }; Returns: { outcome: MarketOutcome; positions_settled: number } }
      sell_position:      { Args: { p_position_id: string; p_player_id: string }; Returns: { realized_pnl: number; sale_value: number; new_balance: number } }
      submit_player_market: { Args: { p_player_id: string; p_question: string; p_category: MarketCategory; p_closes_at: string; p_gut_yes_price?: number }; Returns: { market_id: string; status: MarketStatus } }
    }
  }
}
