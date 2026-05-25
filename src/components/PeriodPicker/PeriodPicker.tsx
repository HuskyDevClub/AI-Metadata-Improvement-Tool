import { useEffect, useMemo, useRef, useState } from 'react';
import {
    canParsePeriodString,
    EMPTY_PERIOD_SIDE,
    PERIOD_MONTHS,
    periodDaysInMonth,
    type PeriodSide,
    type PeriodState,
    periodStateToString,
    periodStringToState,
} from '../../utils/periodOfTime';
import './PeriodPicker.css';

type Mode = 'pickers' | 'custom';

interface PeriodPickerProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    minYear?: number;
    maxYear?: number;
}

interface SidePickerProps {
    label: string;
    side: PeriodSide;
    onChange: (next: PeriodSide) => void;
    disabled?: boolean;
    yearRange: number[];
}

function SidePicker({ label, side, onChange, disabled, yearRange }: SidePickerProps) {
    const maxDay = periodDaysInMonth(side.year, side.month);
    const dayOptions = useMemo(
        () => Array.from({ length: maxDay }, (_, i) => i + 1),
        [maxDay]
    );

    return (
        <div className="period-picker-side">
            <span className="period-picker-side-label">{label}</span>
            <div className="period-picker-controls">
                <select
                    className="period-picker-select period-picker-select-year"
                    value={side.year}
                    onChange={(e) => onChange({ ...side, year: e.target.value })}
                    disabled={disabled}
                    aria-label={`${label} year`}
                >
                    <option value="">Year</option>
                    {yearRange.map((y) => (
                        <option key={y} value={String(y)}>{y}</option>
                    ))}
                </select>
                <select
                    className="period-picker-select period-picker-select-month"
                    value={side.month}
                    onChange={(e) => onChange({
                        ...side,
                        month: e.target.value,
                        day: e.target.value ? side.day : '',
                    })}
                    disabled={disabled || !side.year}
                    aria-label={`${label} month`}
                >
                    <option value="">Month (optional)</option>
                    {PERIOD_MONTHS.map((name, i) => (
                        <option key={name} value={String(i + 1)}>{name}</option>
                    ))}
                </select>
                <select
                    className="period-picker-select period-picker-select-day"
                    value={side.day && parseInt(side.day, 10) <= maxDay ? side.day : ''}
                    onChange={(e) => onChange({ ...side, day: e.target.value })}
                    disabled={disabled || !side.month}
                    aria-label={`${label} day`}
                >
                    <option value="">Day (optional)</option>
                    {dayOptions.map((d) => (
                        <option key={d} value={String(d)}>{d}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}

function pickInitialMode(value: string): Mode {
    if (!value || !value.trim()) return 'pickers';
    return canParsePeriodString(value) ? 'pickers' : 'custom';
}

export function PeriodPicker({
                                 value,
                                 onChange,
                                 disabled = false,
                                 minYear = 1900,
                                 maxYear,
                             }: PeriodPickerProps) {
    const effectiveMaxYear = maxYear ?? new Date().getFullYear() + 5;
    const yearRange = useMemo(() => {
        const years: number[] = [];
        for (let y = effectiveMaxYear; y >= minYear; y--) years.push(y);
        return years;
    }, [minYear, effectiveMaxYear]);

    const [mode, setMode] = useState<Mode>(() => pickInitialMode(value));
    const [state, setState] = useState<PeriodState>(() => periodStringToState(value));
    const lastEmittedRef = useRef<string>(value);
    const userPickedModeRef = useRef<boolean>(false);

    useEffect(() => {
        if (value !== lastEmittedRef.current) {
            setState(periodStringToState(value));
            lastEmittedRef.current = value;
            if (!userPickedModeRef.current) {
                setMode(pickInitialMode(value));
            }
        }
    }, [value]);

    const commit = (next: PeriodState) => {
        setState(next);
        const str = periodStateToString(next);
        lastEmittedRef.current = str;
        onChange(str);
    };

    const switchMode = (next: Mode) => {
        userPickedModeRef.current = true;
        if (next === 'pickers' && mode === 'custom') {
            setState(periodStringToState(value));
        }
        setMode(next);
    };

    return (
        <div className="period-picker-wrap">
            <div className="period-picker-mode-toggle" role="tablist" aria-label="Input mode">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'pickers'}
                    className={`period-picker-mode-btn ${mode === 'pickers' ? 'is-active' : ''}`}
                    onClick={() => switchMode('pickers')}
                    disabled={disabled}
                >
                    Date pickers
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'custom'}
                    className={`period-picker-mode-btn ${mode === 'custom' ? 'is-active' : ''}`}
                    onClick={() => switchMode('custom')}
                    disabled={disabled}
                >
                    Custom text
                </button>
            </div>

            {mode === 'pickers' ? (
                <div className="period-picker" role="group" aria-label="Period of time">
                    <SidePicker
                        label="From"
                        side={state.start}
                        onChange={(s) => commit({ ...state, start: s })}
                        disabled={disabled}
                        yearRange={yearRange}
                    />
                    <div className="period-picker-end">
                        <SidePicker
                            label="To"
                            side={state.endIsPresent ? EMPTY_PERIOD_SIDE : state.end}
                            onChange={(s) => commit({ ...state, end: s, endIsPresent: false })}
                            disabled={disabled || state.endIsPresent}
                            yearRange={yearRange}
                        />
                        <label className="period-picker-present">
                            <input
                                type="checkbox"
                                checked={state.endIsPresent}
                                onChange={(e) => commit({
                                    ...state,
                                    endIsPresent: e.target.checked,
                                    end: e.target.checked ? EMPTY_PERIOD_SIDE : state.end,
                                })}
                                disabled={disabled}
                            />
                            to present
                        </label>
                    </div>
                </div>
            ) : (
                <input
                    type="text"
                    className="period-picker-custom-input"
                    placeholder="e.g. 2023 to 2025, 12/22/2024 - 9/11/2026, fiscal years 2018-2024"
                    value={value}
                    onChange={(e) => {
                        const next = e.target.value;
                        lastEmittedRef.current = next;
                        onChange(next);
                    }}
                    disabled={disabled}
                />
            )}
        </div>
    );
}
