import type { OrderStatus } from "@taxi/shared";
import { orderStatusLabels } from "@taxi/shared";

interface StatusPillProps {
  status: OrderStatus;
}

export const StatusPill = ({ status }: StatusPillProps) => (
  <span className={`status-pill status-pill--${status}`}>
    {orderStatusLabels[status]}
  </span>
);
