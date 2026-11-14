"use client";

import { Identicon } from "@/components/ui/identicon";
import { SelectMenu } from "@/components/ui/select-menu";
import type { WalletTokens } from "@/lib/platform-tokens";

/** "From wallet" picker for live plans when the account has more than one verified wallet. */
export function WalletSwitch({
  wallets,
  value,
  onChange,
}: {
  wallets: WalletTokens[];
  value: string;
  onChange: (address: string) => void;
}) {
  return (
    <SelectMenu
      variant="picker"
      label="From wallet"
      ariaLabel="From wallet"
      value={value}
      onValueChange={onChange}
      options={wallets.map((w) => ({
        value: w.address,
        label: `${w.address.slice(0, 6)}…${w.address.slice(-4)}`,
        icon: <Identicon seed={w.address} size={40} />,
      }))}
    />
  );
}
