'use client';

import { useState } from 'react';

import { getDataConsent, recordConsent } from '@/lib/consent';

/**
 * Terms-of-use and dataset-consent gate, per item 7 of the project review
 * notes. Two separate checkboxes: accepting the terms is required to use the
 * system, allowing uploads to be reused for dataset/model development is
 * optional and declining it blocks nothing.
 *
 * It is shown on every entry to the system. Module scope, not storage, is
 * what remembers the answer, so a client-side navigation does not re-prompt
 * but any fresh load of the app does.
 */
let acknowledgedThisLoad = false;

export function ConsentGate({ onDecline }: { onDecline: () => void }) {
  const [visible, setVisible] = useState(!acknowledgedThisLoad);
  const [terms, setTerms] = useState(false);
  // The optional answer defaults to whatever was chosen last time.
  const [data, setData] = useState(() => getDataConsent());

  if (!visible) return null;

  function accept() {
    recordConsent(true, data);
    acknowledgedThisLoad = true;
    setVisible(false);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="modal-card">
        <div className="modal-head">
          <h2 id="consent-title">Terms of Use &amp; Data Consent</h2>
          <p className="m-0 mt-[3px] text-[12px] text-slate-400">
            Please confirm before using PD Insight. This appears each time you enter the system.
          </p>
        </div>

        <div className="modal-body">
          <div className="callout callout-red mb-[14px]">
            <b>PD Insight is a decision support tool, not a diagnostic authority.</b> Its
            classification, gap-time and severity outputs are preliminary assessments produced by
            AI models and rule tables. They must be reviewed against the original measurement data
            and confirmed by a qualified engineer before being used for any maintenance or
            engineering decision.
          </div>

          <p className="mb-[6px] text-[12px] font-semibold text-slate-700">
            What you should know before continuing
          </p>
          <ul className="help-bullets mb-[16px]">
            <li>
              The models recognise <b>three PD classes only</b>: Corona, Surface and Internal.
              Mixed or multiple simultaneous PD sources may be classified incorrectly.
            </li>
            <li>
              Results depend on input quality. Low-resolution, cropped, annotated or noisy PRPD
              images reduce the reliability of the output.
            </li>
            <li>
              A confidence score is not proof of correctness, and{' '}
              <b>Initial / Moderate / High severity are the criteria of this framework</b>, not an
              international standard for all PD systems.
            </li>
            <li>
              When gap-time cannot be determined the case is reported as{' '}
              <b>Not measurable</b> rather than assigned a severity.
            </li>
          </ul>
          <p className="mb-[16px] text-[11.5px] text-slate-400">
            The full scope and limitations, together with the theory and the references behind
            these rules, are in Help, reachable from the sidebar and the <b>?</b> button at any
            time.
          </p>

          <div className="space-y-[10px]">
            <label className={`consent-item ${terms ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
              />
              <span>
                <span className="lbl">
                  I accept the terms of use <span className="text-red-700">*</span>
                </span>
                <span className="desc">
                  I understand that PD Insight provides preliminary assessments only, that the
                  results must be verified by a qualified engineer, and that the system does not
                  replace expert diagnosis. Required.
                </span>
              </span>
            </label>

            <label className={`consent-item ${data ? 'checked' : ''}`}>
              <input type="checkbox" checked={data} onChange={(e) => setData(e.target.checked)} />
              <span>
                <span className="lbl">
                  I allow my uploaded data to be used to develop the dataset and models{' '}
                  <span className="text-[11px] font-medium text-slate-400">optional</span>
                </span>
                <span className="desc">
                  Stored for this purpose: the PRPD image, the TF Map when one is uploaded, the
                  confirmed class label, the model result, and related metadata (case name,
                  timestamps, calibration values, reviewer account). No other personal data is
                  collected. Declining this does not limit any analysis feature.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="modal-foot">
          <button className="small-link" onClick={onDecline} type="button">
            Decline and sign out
          </button>
          <button className="btn btn-blue" onClick={accept} disabled={!terms} type="button">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
