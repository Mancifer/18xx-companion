import type { ReactNode } from "react";
import { useSession } from "../../app/useSession";
import { cashOf } from "../../domain/events/state";
import { formatMoney } from "../../domain/i18n/format";
import type { PlayerId } from "../../domain/types";
import { HolderSheet } from "./HolderSheet";

/** Manual adjustments for a player (FR-024). */
export function PlayerSheet({
  playerId,
  onClose,
  extraActions,
}: {
  playerId: PlayerId;
  onClose: () => void;
  extraActions?: ReactNode;
}) {
  const { meta, state } = useSession();
  const player = meta.players.find((p) => p.id === playerId);
  if (!player) return null;
  const ref = `player:${playerId}` as const;
  return (
    <HolderSheet
      holder={ref}
      title={player.name}
      onClose={onClose}
      extraActions={extraActions}
      info={
        meta.walletMode === "appTruth" ? (
          <p className="money sheet-figure">{formatMoney(cashOf(state, ref), meta.game)}</p>
        ) : null
      }
    />
  );
}
