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
  schema, values, onChangeAction,
}: {
  schema: FormatSetting[];
  values: SettingsBag;
  onChangeAction: (key: string, value: SettingValue) => void;
}) {
  return (
    <div className="space-y-3">
      {schema.map((s) => (
        <SettingField key={s.key} setting={s} value={settingValue(schema, values, s.key)} onChange={(v) => onChangeAction(s.key, v)} />
      ))}
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500';

function SettingField({ setting, value, onChange }: { setting: FormatSetting; value: SettingValue; onChange: (v: SettingValue) => void }) {
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
        <select className={inputCls} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {(setting.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {setting.hint && <p className="text-xs text-gray-500 mt-1">{setting.hint}</p>}
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
