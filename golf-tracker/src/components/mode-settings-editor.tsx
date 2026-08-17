'use client';

import { useState } from 'react';
import type { FormatSetting } from '@/lib/formats';
import type { SettingsBag, SettingValue } from '@/lib/game-modes';
import { settingValue } from '@/lib/game-modes';

// Generic renderer for a game mode's FormatSetting[] schema. Each setting becomes
// a labeled control (toggle / select / number / free text) writing into the
// settings bag via onChange. This is what makes "pick a game → its options
// appear" work for ANY registered game with zero bespoke UI. Used by both the
// creation wizard and the hub's live settings editor.
export function ModeSettingsEditor({
  schema, values, onChangeAction, lockOptionAction, lockNoteAction,
}: {
  schema: FormatSetting[];
  values: SettingsBag;
  onChangeAction: (key: string, value: SettingValue) => void;
  // Optional: mark individual SELECT options as unavailable. Returns a short reason to
  // append to the label, or null when the option is fine. Kept as a predicate so this
  // renderer stays purely schema-driven — the rule about WHICH options are locked belongs
  // to the caller (the hub uses it to stop a scored game becoming a one-ball format, F-012).
  lockOptionAction?: (settingKey: string, optionValue: string) => string | null;
  // Optional: an explanation shown UNDER the field whenever that setting has locked options.
  // A disabled <option> is invisible until the dropdown is opened, so the reason has to be on
  // the page itself — the classic pool's own picker already does this, and without it the two
  // halves of the same rule read differently on screen.
  lockNoteAction?: (settingKey: string) => string | null;
}) {
  // Honor each setting's optional showIf predicate: hide a field unless the
  // referenced setting(s) match (single condition, or an array = AND). Keeps the
  // editor uncluttered (e.g. "$ per point" only when moneyModel = per-point).
  const visible = schema.filter((s) => {
    if (!s.showIf) return true;
    const conds = Array.isArray(s.showIf) ? s.showIf : [s.showIf];
    return conds.every((c) => c.in.includes(String(settingValue(schema, values, c.key))));
  });
  return (
    <div className="space-y-3">
      {visible.map((s) => (
        <SettingField
          key={s.key}
          setting={s}
          value={settingValue(schema, values, s.key)}
          onChange={(v) => onChangeAction(s.key, v)}
          lockOption={lockOptionAction ? (ov: string) => lockOptionAction(s.key, ov) : undefined}
          lockNote={lockNoteAction?.(s.key) ?? null}
        />
      ))}
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

function SettingField({ setting, value, onChange, lockOption, lockNote }: {
  setting: FormatSetting;
  value: SettingValue;
  onChange: (v: SettingValue) => void;
  lockOption?: (optionValue: string) => string | null;
  lockNote?: string | null;
}) {
  if (setting.type === 'toggle') {
    return (
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          checked={value === true || value === 'true'}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium text-gray-800">{setting.label}</span>
          {setting.hint && <span className="block text-xs text-gray-500">{setting.hint}</span>}
        </span>
      </label>
    );
  }

  if (setting.type === 'select') {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1">{setting.label}</label>
        <select
          className={inputCls}
          value={String(value)}
          onChange={(e) => {
            // Guard the HANDLER too, not just the <option disabled> — a disabled option can
            // still be set programmatically, which is how the pool picker's equivalent guard
            // was bypassed the first time (F-006 follow-up).
            if (lockOption?.(e.target.value)) return;
            onChange(e.target.value);
          }}
        >
          {(setting.options ?? []).map((o) => {
            const locked = lockOption?.(o.value) ?? null;
            return (
              <option key={o.value} value={o.value} disabled={!!locked}>
                {o.label}{locked ? ` — ${locked}` : ''}
              </option>
            );
          })}
        </select>
        {setting.hint && <p className="text-xs text-gray-500 mt-1">{setting.hint}</p>}
        {lockNote && <p className="text-xs text-amber-700 mt-1">{lockNote}</p>}
      </div>
    );
  }

  // number / text — keep a local draft so the field can be cleared and retyped
  // without snapping back mid-edit (commits on blur / Enter).
  return <TextishField setting={setting} value={value} onChange={onChange} />;
}

function TextishField({ setting, value, onChange }: { setting: FormatSetting; value: SettingValue; onChange: (v: SettingValue) => void }) {
  const isNumber = setting.type === 'number';
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value ?? '');
  const commit = () => {
    if (draft === null) return;
    if (isNumber) {
      const n = draft.trim() === '' || isNaN(parseFloat(draft)) ? Number(setting.defaultValue) || 0 : parseFloat(draft);
      onChange(n);
    } else {
      onChange(draft);
    }
    setDraft(null);
  };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-800 mb-1">{setting.label}</label>
      <input
        type={isNumber ? 'number' : 'text'}
        inputMode={isNumber ? 'decimal' : undefined}
        className={inputCls}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      {setting.hint && <p className="text-xs text-gray-500 mt-1">{setting.hint}</p>}
    </div>
  );
}
