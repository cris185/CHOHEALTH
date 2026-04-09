'use client';

import { useEffect, useState } from 'react';
import { paymentMethods, SavedCard, SetupIntentResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CreditCard, Plus, Trash2, Star, Loader2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

const BRAND_ICONS: Record<string, string> = {
  visa: '💳 Visa',
  mastercard: '💳 Mastercard',
  amex: '💳 Amex',
  discover: '💳 Discover',
};

function AddCardForm({ clientSecret, onSuccess, onCancel }: {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError('');

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    const { error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (stripeError) {
      setError(stripeError.message || 'Failed to save card.');
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Card Details</p>
        <div className="rounded-md border bg-background p-3">
          <CardElement options={{
            style: {
              base: { fontSize: '14px', color: '#1e293b', '::placeholder': { color: '#94a3b8' } },
            },
            disableLink: true,
            hidePostalCode: true,
          }} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !stripe}>
          {loading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Save Card
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export default function SavedCardsSection() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [setupIntent, setSetupIntent] = useState<SetupIntentResponse | null>(null);
  const [settingUp, setSettingUp] = useState(false);

  const fetchCards = () => {
    const token = localStorage.getItem('access_token') || '';
    setLoading(true);
    paymentMethods.listCards(token).then(setCards).catch(() => setCards([])).finally(() => setLoading(false));
  };

  useEffect(() => { fetchCards(); }, []);

  const handleAddCard = async () => {
    setSettingUp(true);
    const token = localStorage.getItem('access_token') || '';
    try {
      const result = await paymentMethods.setupCard(token);
      setSetupIntent(result);
      setShowAddForm(true);
    } catch { /* ignore */ }
    finally { setSettingUp(false); }
  };

  const handleCardSaved = () => {
    setShowAddForm(false);
    setSetupIntent(null);
    fetchCards();
  };

  const handleDeleteCard = async (id: string) => {
    const token = localStorage.getItem('access_token') || '';
    await paymentMethods.deleteCard(id, token).catch(() => {});
    setCards(cards.filter((c) => c.id !== id));
  };

  const handleSetDefault = async (id: string) => {
    const token = localStorage.getItem('access_token') || '';
    await paymentMethods.setDefault(id, token).catch(() => {});
    setCards(cards.map((c) => ({ ...c, is_default: c.id === id })));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Payment Methods
          </CardTitle>
          {!showAddForm && (
            <Button variant="outline" size="sm" onClick={handleAddCard} disabled={settingUp}>
              {settingUp ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Add Card
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Add card form */}
        {showAddForm && setupIntent && (
          <Elements stripe={stripePromise} options={{ clientSecret: setupIntent.client_secret }}>
            <AddCardForm
              clientSecret={setupIntent.client_secret}
              onSuccess={handleCardSaved}
              onCancel={() => { setShowAddForm(false); setSetupIntent(null); }}
            />
          </Elements>
        )}

        <Separator />

        {/* Card list */}
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading cards...</div>
        ) : cards.length === 0 ? (
          <div className="py-8 text-center">
            <CreditCard className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">No saved cards yet.</p>
            <p className="text-xs text-muted-foreground/60">Add a card for faster checkout.</p>
          </div>
        ) : (
          <div className={cards.length > 3 ? 'max-h-[280px] overflow-y-auto space-y-3 pr-1' : 'space-y-3'}>
          {cards.map((card) => (
            <div key={card.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <CreditCard className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold capitalize">{card.brand}</p>
                    <span className="text-sm text-muted-foreground">•••• {card.last4}</span>
                    {card.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Expires {String(card.exp_month).padStart(2, '0')}/{card.exp_year}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!card.is_default && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleSetDefault(card.id)}>
                    <Star className="mr-1 h-3 w-3" /> Set Default
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteCard(card.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
