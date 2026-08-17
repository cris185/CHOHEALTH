'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  appointments as appointmentsApi,
  medications as medicationsApi,
  labTests as labTestsApi,
  MedicationCatalogItem,
  LabTestItem,
  AppointmentCompletePayload,
  PrescriptionItemPayload,
  LabOrderItemPayload,
} from '@/lib/api';

const FREQUENCY_KEYS: { value: string; labelKey: string }[] = [
  { value: 'Once a day', labelKey: 'onceADay' },
  { value: 'Twice a day', labelKey: 'twiceADay' },
  { value: 'Three times a day', labelKey: 'threeTimesADay' },
  { value: 'Every 4 hours', labelKey: 'every4h' },
  { value: 'Every 6 hours', labelKey: 'every6h' },
  { value: 'Every 8 hours', labelKey: 'every8h' },
  { value: 'Every 12 hours', labelKey: 'every12h' },
  { value: 'As needed', labelKey: 'asNeeded' },
];

interface RxItemForm {
  id: string;
  medication_sid: string; // empty → free-text mode
  medication_name: string; // what we actually send + display
  dosage: string;
  frequency: string;
  duration_days: number;
  instructions: string;
}

interface LabItemForm {
  test_sid: string;
  test_name: string;
  category: string;
  notes: string;
}

interface ConsultationCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentSid: string;
  patientName: string;
  appointmentDate: string;
  onCompleted: () => void;
}

// Poor-man's uuid — we only need it for React keys inside this component.
const makeLocalId = () => `rx-${Math.random().toString(36).slice(2, 10)}`;

const emptyRxItem = (): RxItemForm => ({
  id: makeLocalId(),
  medication_sid: '',
  medication_name: '',
  dosage: '',
  frequency: 'Once a day',
  duration_days: 7,
  instructions: '',
});

/**
 * Closes a consultation atomically: diagnosis + optional prescription +
 * optional lab order, in one POST to `/appointments/doctor/<sid>/complete/`.
 */
export default function ConsultationCloseModal({
  isOpen,
  onClose,
  appointmentSid,
  patientName,
  appointmentDate,
  onCompleted,
}: ConsultationCloseModalProps) {
  const t = useTranslations('dashboard.doctor.consultationClose');
  const tFreq = useTranslations('dashboard.doctor.consultationClose.frequencyOptions');

  // Form state
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [visitNotes, setVisitNotes] = useState('');

  const [rxEnabled, setRxEnabled] = useState(false);
  const [rxNotes, setRxNotes] = useState('');
  const [rxItems, setRxItems] = useState<RxItemForm[]>([]);

  const [labEnabled, setLabEnabled] = useState(false);
  const [labNotes, setLabNotes] = useState('');
  const [labItems, setLabItems] = useState<LabItemForm[]>([]);

  // Shared catalogs (loaded once when the modal opens)
  const [medicationCatalog, setMedicationCatalog] = useState<MedicationCatalogItem[]>([]);
  const [labCatalog, setLabCatalog] = useState<LabTestItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [labSearch, setLabSearch] = useState('');

  // Submit state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset + catalog fetch when the modal opens
  const catalogAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!isOpen) return;

    setDiagnosis('');
    setTreatmentPlan('');
    setVisitNotes('');
    setRxEnabled(false);
    setRxNotes('');
    setRxItems([]);
    setLabEnabled(false);
    setLabNotes('');
    setLabItems([]);
    setLabSearch('');
    setError('');

    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;

    setCatalogLoading(true);
    const token = localStorage.getItem('access_token') || '';
    Promise.all([
      medicationsApi.list(token).catch(() => [] as MedicationCatalogItem[]),
      labTestsApi.list(token).catch(() => [] as LabTestItem[]),
    ]).then(([meds, labs]) => {
      if (controller.signal.aborted) return;
      setMedicationCatalog(meds);
      setLabCatalog(labs);
    }).finally(() => {
      if (!controller.signal.aborted) setCatalogLoading(false);
    });

    return () => controller.abort();
  }, [isOpen]);

  // --- Rx helpers ---

  const addRxItem = useCallback(() => {
    setRxEnabled(true);
    setRxItems((items) => [...items, emptyRxItem()]);
  }, []);

  const updateRxItem = useCallback((id: string, patch: Partial<RxItemForm>) => {
    setRxItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeRxItem = useCallback((id: string) => {
    setRxItems((items) => items.filter((it) => it.id !== id));
  }, []);

  // --- Lab helpers ---

  const filteredLabs = useMemo(() => {
    const q = labSearch.trim().toLowerCase();
    const selected = new Set(labItems.map((l) => l.test_sid));
    const available = labCatalog.filter((t) => !selected.has(t.sid));
    if (!q) return available;
    return available.filter(
      (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [labSearch, labCatalog, labItems]);

  const addLabItem = useCallback((test: LabTestItem) => {
    setLabItems((items) => [
      ...items,
      { test_sid: test.sid, test_name: test.name, category: test.category, notes: '' },
    ]);
    setLabSearch('');
  }, []);

  const updateLabItemNotes = useCallback((test_sid: string, notes: string) => {
    setLabItems((items) => items.map((it) => (it.test_sid === test_sid ? { ...it, notes } : it)));
  }, []);

  const removeLabItem = useCallback((test_sid: string) => {
    setLabItems((items) => items.filter((it) => it.test_sid !== test_sid));
  }, []);

  // --- Submit ---

  const handleSubmit = async () => {
    setError('');

    if (!diagnosis.trim()) {
      setError(t('diagnosisRequired'));
      return;
    }

    // Validate Rx items (only if the section is enabled and there are items)
    const activeRxItems = rxEnabled ? rxItems : [];
    for (const item of activeRxItems) {
      const nameOk = item.medication_sid || item.medication_name.trim();
      const basicOk = item.dosage.trim() && item.frequency && item.duration_days > 0;
      if (!nameOk || !basicOk) {
        setError(t('rxItemIncomplete'));
        return;
      }
    }

    const payload: AppointmentCompletePayload = {
      diagnosis: diagnosis.trim(),
      treatment_plan: treatmentPlan.trim() || undefined,
      notes: visitNotes.trim() || undefined,
    };

    if (activeRxItems.length > 0) {
      payload.prescription = {
        additional_notes: rxNotes.trim() || undefined,
        items: activeRxItems.map<PrescriptionItemPayload>((it) => ({
          medication_sid: it.medication_sid || undefined,
          medication_name: it.medication_sid ? undefined : it.medication_name.trim(),
          dosage: it.dosage.trim(),
          frequency: it.frequency,
          duration_days: it.duration_days,
          instructions: it.instructions.trim() || undefined,
        })),
      };
    }

    if (labEnabled && labItems.length > 0) {
      payload.lab_order = {
        notes: labNotes.trim() || undefined,
        items: labItems.map<LabOrderItemPayload>((it) => ({
          test_sid: it.test_sid,
          notes: it.notes.trim() || undefined,
        })),
      };
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      await appointmentsApi.doctorComplete(appointmentSid, payload, token);
      onCompleted();
      onClose();
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || t('genericError'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const formattedDate = new Date(appointmentDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('title')}</h2>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-medium">{t('patient')}:</span> {patientName}
              <span className="mx-2 text-gray-300">·</span>
              <span className="font-medium">{t('appointment')}:</span> {formattedDate}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Section: diagnosis & notes */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t('diagnosisSection')}
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                {t('diagnosis')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder={t('diagnosisPlaceholder')}
                rows={2}
                disabled={saving}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t('treatmentPlan')}</label>
              <textarea
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                placeholder={t('treatmentPlanPlaceholder')}
                rows={2}
                disabled={saving}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t('visitNotes')}</label>
              <textarea
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
                placeholder={t('visitNotesPlaceholder')}
                rows={2}
                disabled={saving}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
          </section>

          {/* Section: prescription */}
          <section className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('prescriptionSection')}
              </h3>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={rxEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setRxEnabled(next);
                    if (next && rxItems.length === 0) setRxItems([emptyRxItem()]);
                  }}
                  disabled={saving}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                {t('prescriptionToggle')}
              </label>
            </div>

            {rxEnabled && (
              <>
                <p className="text-xs text-gray-500">{t('prescriptionHint')}</p>
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    {t('additionalNotes')}
                  </label>
                  <textarea
                    value={rxNotes}
                    onChange={(e) => setRxNotes(e.target.value)}
                    placeholder={t('additionalNotesPlaceholder')}
                    rows={2}
                    disabled={saving}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                </div>

                <div className="space-y-3">
                  {rxItems.map((item, idx) => (
                    <RxItemCard
                      key={item.id}
                      item={item}
                      index={idx}
                      catalog={medicationCatalog}
                      catalogLoading={catalogLoading}
                      disabled={saving}
                      onChange={(patch) => updateRxItem(item.id, patch)}
                      onRemove={() => removeRxItem(item.id)}
                      frequencyOptions={FREQUENCY_KEYS.map((f) => ({
                        value: f.value,
                        label: tFreq(f.labelKey),
                      }))}
                      labels={{
                        catalog: t('rxItemCatalog'),
                        catalogPlaceholder: t('rxItemCatalogPlaceholder'),
                        catalogNone: t('rxItemCatalogNone'),
                        freeText: t('rxItemFreeText'),
                        freeTextPlaceholder: t('rxItemFreeTextPlaceholder'),
                        dosage: t('rxItemDosage'),
                        dosagePlaceholder: t('rxItemDosagePlaceholder'),
                        frequency: t('rxItemFrequency'),
                        duration: t('rxItemDuration'),
                        instructions: t('rxItemInstructions'),
                        instructionsPlaceholder: t('rxItemInstructionsPlaceholder'),
                        remove: t('rxItemRemove'),
                        badgeFree: t('rxBadgeFree'),
                        badgePaid: (cost: string) => t('rxBadgePaid', { cost }),
                        badgeRxRequired: t('rxBadgeRxRequired'),
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addRxItem}
                  disabled={saving}
                  className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  + {t('addRxItem')}
                </button>
              </>
            )}
          </section>

          {/* Section: lab orders */}
          <section className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('labSection')}
              </h3>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={labEnabled}
                  onChange={(e) => setLabEnabled(e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                {t('labToggle')}
              </label>
            </div>

            {labEnabled && (
              <>
                <p className="text-xs text-gray-500">{t('labHint')}</p>

                <div>
                  <label className="block text-xs font-medium text-gray-700">{t('labSearch')}</label>
                  <input
                    type="text"
                    value={labSearch}
                    onChange={(e) => setLabSearch(e.target.value)}
                    placeholder={t('labSearchPlaceholder')}
                    disabled={saving}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  {labSearch && (
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
                      {filteredLabs.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-500">{t('labNoResults')}</div>
                      ) : (
                        filteredLabs.slice(0, 20).map((test) => (
                          <button
                            key={test.sid}
                            type="button"
                            onClick={() => addLabItem(test)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                          >
                            <span className="flex-1">
                              <span className="font-medium text-gray-900">{test.name}</span>
                              <span className="ml-2 text-xs text-gray-500">{test.category}</span>
                            </span>
                            <span className="text-xs text-gray-400">${test.cost}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {labItems.length === 0 ? (
                    <p className="text-xs text-gray-400">{t('labSelectedNone')}</p>
                  ) : (
                    labItems.map((item) => (
                      <div key={item.test_sid} className="flex items-start gap-2 rounded-md bg-gray-50 p-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{item.test_name}</div>
                          <div className="text-xs text-gray-500">{item.category}</div>
                          <input
                            type="text"
                            value={item.notes}
                            onChange={(e) => updateLabItemNotes(item.test_sid, e.target.value)}
                            placeholder={t('labOrderNotesPlaceholder')}
                            disabled={saving}
                            className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLabItem(item.test_sid)}
                          disabled={saving}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {t('labRemove')}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {labItems.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700">{t('labOrderNotes')}</label>
                    <textarea
                      value={labNotes}
                      onChange={(e) => setLabNotes(e.target.value)}
                      placeholder={t('labOrderNotesPlaceholder')}
                      rows={2}
                      disabled={saving}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !diagnosis.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t('saving') : t('saveAndComplete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RxItemCard — one row of the prescription section
// ============================================================================

interface RxItemCardProps {
  item: RxItemForm;
  index: number;
  catalog: MedicationCatalogItem[];
  catalogLoading: boolean;
  disabled: boolean;
  onChange: (patch: Partial<RxItemForm>) => void;
  onRemove: () => void;
  frequencyOptions: { value: string; label: string }[];
  labels: {
    catalog: string;
    catalogPlaceholder: string;
    catalogNone: string;
    freeText: string;
    freeTextPlaceholder: string;
    dosage: string;
    dosagePlaceholder: string;
    frequency: string;
    duration: string;
    instructions: string;
    instructionsPlaceholder: string;
    remove: string;
    badgeFree: string;
    badgePaid: (cost: string) => string;
    badgeRxRequired: string;
  };
}

function RxItemCard({
  item,
  index,
  catalog,
  catalogLoading,
  disabled,
  onChange,
  onRemove,
  frequencyOptions,
  labels,
}: RxItemCardProps) {
  const [search, setSearch] = useState('');

  const selectedMed = useMemo(
    () => (item.medication_sid ? catalog.find((m) => m.sid === item.medication_sid) || null : null),
    [item.medication_sid, catalog],
  );

  const filtered = useMemo(() => {
    if (!search.trim() || item.medication_sid) return [];
    const q = search.trim().toLowerCase();
    return catalog
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.generic_name && m.generic_name.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [search, catalog, item.medication_sid]);

  const pickMed = (med: MedicationCatalogItem) => {
    onChange({
      medication_sid: med.sid,
      medication_name: med.generic_name ? `${med.name} (${med.generic_name})` : med.name,
    });
    setSearch('');
  };

  const clearMed = () => {
    onChange({ medication_sid: '', medication_name: '' });
  };

  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          #{index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {labels.remove}
        </button>
      </div>

      {/* Catalog selector */}
      <div>
        <label className="block text-xs font-medium text-gray-700">{labels.catalog}</label>
        {selectedMed ? (
          <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900">
                {selectedMed.name}
                {selectedMed.strength && (
                  <span className="ml-1 text-xs text-gray-500">{selectedMed.strength}</span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                {selectedMed.requires_prescription && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                    {labels.badgeRxRequired}
                  </span>
                )}
                {selectedMed.free_when_prescribed ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                    {labels.badgeFree}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 font-medium text-gray-700">
                    {labels.badgePaid(selectedMed.cost)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={clearMed}
              disabled={disabled}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-white disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={catalogLoading ? '…' : labels.catalogPlaceholder}
              disabled={disabled || catalogLoading}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            {search && filtered.length > 0 && (
              <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
                {filtered.map((med) => (
                  <button
                    key={med.sid}
                    type="button"
                    onClick={() => pickMed(med)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gray-900">{med.name}</span>
                      {med.generic_name && (
                        <span className="block truncate text-xs text-gray-500">{med.generic_name}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px]">
                      {med.free_when_prescribed ? (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
                          {labels.badgeFree}
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 font-medium text-gray-700">
                          ${med.cost}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!search && !catalogLoading && (
              <p className="mt-1 text-[11px] text-gray-400">{labels.catalogNone}</p>
            )}
          </>
        )}
      </div>

      {/* Free-text fallback (only used when nothing is picked from the catalog) */}
      {!selectedMed && (
        <div>
          <label className="block text-xs font-medium text-gray-700">{labels.freeText}</label>
          <input
            type="text"
            value={item.medication_name}
            onChange={(e) => onChange({ medication_name: e.target.value })}
            placeholder={labels.freeTextPlaceholder}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
      )}

      {/* Dosage / frequency / duration */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-gray-700">{labels.dosage}</label>
          <input
            type="text"
            value={item.dosage}
            onChange={(e) => onChange({ dosage: e.target.value })}
            placeholder={labels.dosagePlaceholder}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">{labels.frequency}</label>
          <select
            value={item.frequency}
            onChange={(e) => onChange({ frequency: e.target.value })}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            {frequencyOptions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">{labels.duration}</label>
          <input
            type="number"
            min={1}
            value={item.duration_days}
            onChange={(e) => onChange({ duration_days: Math.max(1, Number(e.target.value) || 1) })}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">{labels.instructions}</label>
        <input
          type="text"
          value={item.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
          placeholder={labels.instructionsPlaceholder}
          disabled={disabled}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
      </div>
    </div>
  );
}
