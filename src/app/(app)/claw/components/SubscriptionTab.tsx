'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/utils';
import { SubscriptionCard } from './billing/SubscriptionCard';
import { CancelDialog } from './billing/CancelDialog';

export function SubscriptionTab() {
  const trpc = useTRPC();
  const { data: billing } = useQuery(trpc.kiloclaw.getBillingStatus.queryOptions());
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  if (!billing?.subscription) return null;

  return (
    <>
      <SubscriptionCard billing={billing} onCancelClick={() => setShowCancelDialog(true)} />
      <CancelDialog open={showCancelDialog} onOpenChange={setShowCancelDialog} billing={billing} />
    </>
  );
}
