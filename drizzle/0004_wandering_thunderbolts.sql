CREATE TABLE `auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_sessions_expiry` ON `customer_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_phone` ON `customers` (`phone`);--> statement-breakpoint
CREATE TABLE `login_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`provider_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_login_challenges_expiry` ON `login_challenges` (`expires_at`);