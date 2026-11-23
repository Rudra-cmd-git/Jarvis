import { useState } from 'react';
import { Button } from '../common/Button';
import { Panel } from '../common/Panel';
import { useCore } from '../../state/core-context';
import { formatDateTime } from '../../../shared/format';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_SEVERITIES,
  type ActivityCategory,
  type ActivitySeverity,
} from '../../../shared/types';

export function ActivityPanel() {
  const { activity, activityFilter, refreshActivity } = useCore();
  const [category, setCategory] = useState<ActivityCategory | ''>(activityFilter.category ?? '');
  const [severity, setSeverity] = useState<ActivitySeverity | ''>(activityFilter.severity ?? '');
  const [query, setQuery] = useState(activityFilter.query ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setPending(true);
    setError(null);
    try {
      await refreshActivity({
        category: category || undefined,
        severity: severity || undefined,
        query: query.trim() || undefined,
        limit: 50,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The activity log could not be read.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel
      title="Activity log"
      eyebrow="PERSISTED AUDIT TRAIL"
      action={
        <Button onClick={() => void apply()} disabled={pending} data-action="refresh-activity">
          {pending ? 'Reading…' : 'Apply filter'}
        </Button>
      }
    >
      <div className="activity-filters">
        <label className="field">
          <span>Category</span>
          <select
            className="field-input"
            value={category}
            onChange={(event) => setCategory(event.target.value as ActivityCategory | '')}
            aria-label="Activity category"
          >
            <option value="">All categories</option>
            {ACTIVITY_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Severity</span>
          <select
            className="field-input"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as ActivitySeverity | '')}
            aria-label="Activity severity"
          >
            <option value="">All severities</option>
            {ACTIVITY_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--grow">
          <span>Search</span>
          <input
            className="field-input"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="action or detail"
            aria-label="Activity search"
          />
        </label>
      </div>

      {error && <p className="settings-note settings-note--danger">{error}</p>}

      {activity.length === 0 ? (
        <p className="settings-note">No activity matches the current filter.</p>
      ) : (
        <ul className="activity-list" data-testid="activity-list">
          {activity.map((entry) => (
            <li key={entry.id} className={`activity-entry activity-entry--${entry.severity}`}>
              <div className="activity-head">
                <span className="mono activity-time">{formatDateTime(entry.timestamp)}</span>
                <span className="activity-category">{entry.category}</span>
                <span className={`activity-severity activity-severity--${entry.severity}`}>
                  {entry.severity}
                </span>
                <span className="activity-outcome">{entry.outcome}</span>
              </div>
              <strong className="activity-action">{entry.action}</strong>
              {entry.detail && <span className="activity-detail">{entry.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
