'use client';

import { useEffect, useRef } from 'react';

import { useApp } from '@/lib/app-context';

/**
 * Contextual reference, ported from the prototype's `helpContentHTML` and then
 * extended with the theory and scope-limitation material agreed in the project
 * review:
 *
 *   * "PD Fundamentals" follows Section II of the CMD 2026 paper
 *     (Severity Analysis of Partial Discharge in Artificial Defected Cable
 *     Termination Using AI-Based Hybrid Learning Models).
 *   * "Model & Dataset" and the severity table follow Sections III-IV and
 *     Table I of the same paper.
 *   * "Scope & Limitations" follows items 1-6 of the review notes.
 *   * "Data Handling" summarises item 7; the binding consent lives in the
 *     consent dialog, not here; this page is read-only by design.
 *
 * Thresholds are read from the API so the text never drifts from the backend.
 */

const SECTIONS = [
  { id: 'help-about', label: 'About' },
  { id: 'help-theory', label: 'PD Fundamentals' },
  { id: 'help-workflow', label: 'Workflow' },
  { id: 'help-classification', label: 'Classification' },
  { id: 'help-severity', label: 'Gap-Time & Severity' },
  { id: 'help-limits', label: 'Scope & Limitations' },
  { id: 'help-data', label: 'Data Handling' },
  { id: 'help-refs', label: 'References' },
];

export function HelpPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { options } = useApp();

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target)) return;
      if (target.closest('[data-help-trigger]')) return;
      onClose();
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  const c = options?.constants;
  const topclass = c?.topclass_threshold ?? 30;
  const confidence = c?.confidence_threshold ?? 85;
  const internalHigh = c?.internal_high_confidence ?? 95;
  const cycle = c?.cycle_time_ms ?? 20;
  const dual = c?.joint_dual_threshold ?? 60;
  const strong = c?.strong_rule_threshold ?? 80;
  const highMs = c?.gap_time_high_ms ?? 4;
  const moderateMs = c?.gap_time_moderate_ms ?? 7;
  // One mains cycle spans 360 degrees, so a band in ms has a matching angle.
  const deg = (ms: number) => Math.round((ms * 360) / cycle);

  function jumpTo(id: string) {
    ref.current?.querySelector(`#${id}`)?.scrollIntoView({ block: 'start' });
  }

  return (
    <div className="help-popover right-8 top-[92px]" role="tooltip" ref={ref}>
      <button
        className="absolute right-[10px] top-[10px] z-10 h-[22px] w-[22px] cursor-pointer rounded-sm border-none bg-transparent text-[15px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>

      <h3>Help &amp; Reference</h3>
      <p className="m-0 mb-[14px] text-[12px] text-slate-400">
        What PD Insight is, how a case moves through the workflow, and where the limits of the
        analysis lie.
      </p>

      <div className="help-toc">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => jumpTo(s.id)} type="button">
            {s.label}
          </button>
        ))}
      </div>

      <div className="callout callout-red mb-[16px]">
        <b>The AI output is a preliminary assessment, not a diagnosis.</b> Every suggestion on this
        system must be reviewed together with the original measurement data and confirmed by a
        qualified engineer before it is used for any maintenance or engineering decision.
      </div>

      {/* ================= ABOUT ================= */}
      <section id="help-about">
        <h4>What Is PD Insight?</h4>
        <p>
          PD Insight classifies partial discharge (PD) defects from PRPD (Phase-Resolved Partial
          Discharge) plots. A classification model scores each case against three defect classes (
          <b>Corona</b>, <b>Surface</b> and <b>Internal</b>), and a rule engine combines those
          confidence scores with a gap-time measurement to suggest a PD source and a severity
          rating. Every automated suggestion stays traceable and editable by a human reviewer
          before it is saved.
        </p>
        <p className="mt-[10px]">
          The intended use is <b>preliminary screening</b>: obtaining a first suggestion and
          reducing the workload of reviewing large volumes of PD data. It does not replace expert
          diagnosis.
        </p>
      </section>

      {/* ================= PD FUNDAMENTALS ================= */}
      <section id="help-theory">
        <h4>PD Fundamentals</h4>

        <h5>What partial discharge is, and how it is measured</h5>
        <p>
          PD is a localised electrical discharge inside an insulation system under high electric
          stress, and it is an early indication of insulation degradation. Under IEC 60270 [1], PD
          measurement is a charge-based method whose main measured quantity is the{' '}
          <b>apparent charge</b>. In cable terminations, PD can be initiated by voids, sharp
          conductive points, surface contamination, improper installation, or material defects.
          Because the insulation condition of an underground cable cannot be observed directly
          during operation, PD analysis is one of the few practical routes to early defect
          detection.
        </p>

        <h5>Reading a PRPD pattern</h5>
        <p>
          A PRPD pattern displays PD activity against the phase angle of the applied voltage. The
          horizontal axis is the phase angle from <b>0° to 360°</b>; the vertical axis is the PD
          amplitude, expressed in pC or mV depending on the measuring system. The sinusoid is the
          applied-voltage phase reference, and the scattered points are the high-frequency PD
          pulses picked up by the sensor. Interpretation rests on five features: <b>phase
          position</b>, <b>polarity</b>, <b>amplitude</b>, <b>pulse density</b> and{' '}
          <b>cluster distribution</b>.
        </p>

        <h5>Distinguishing the three PD sources</h5>
        <p>
          The table below summarises the general PRPD characteristics used to separate the three
          classes, following the CIGRE knowledge rules [2], [3]. It is interpretation guidance for
          the reviewer: the models themselves learn from labelled images and do not evaluate these
          rules explicitly.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Class</th>
              <th>Typical PRPD appearance</th>
              <th>PD source reported</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Corona</b>
              </td>
              <td>
                Strongly asymmetric between the two half-cycles, with activity concentrated in a narrow
                phase band near one voltage peak, usually with small, very uniform amplitudes and a
                high repetition rate. Caused by a sharp point or a floating/poorly bonded metal
                part discharging into gas.
              </td>
              <td>Floating / Corona / Bad contact</td>
            </tr>
            <tr>
              <td>
                <b>Surface</b>
              </td>
              <td>
                Activity in both half-cycles but unequal between them, spread over a wide phase
                range and often with a broad amplitude spread. Caused by discharge tracking along
                an insulation surface: contamination, moisture, or a damaged/scrubbed surface.
              </td>
              <td>Outside surface discharge</td>
            </tr>
            <tr>
              <td>
                <b>Internal</b>
              </td>
              <td>
                Two clusters of similar shape and amplitude, roughly symmetric between the positive
                and negative half-cycles and sitting on the rising slopes of the voltage waveform.
                Caused by discharge inside a void or cavity within the insulation.
              </td>
              <td>Internal</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-[10px]">
          A fourth outcome, <b>Terminations / Joint</b>, is not a model class: the rule engine
          reports it when Surface and Internal confidence are both above {dual}%, which indicates a
          defect in the accessory itself rather than a single clean source. A single class above{' '}
          {strong}% is reported as a <b>strong rule</b>; anything weaker is flagged as needing the
          reviewer&apos;s confirmation. Both figures, and the severity bands below, can be tuned per
          account on the Settings page.
        </p>

        <h5>Time-Frequency Map (TF Map)</h5>
        <p>
          A TF Map describes individual PD pulses by their waveform characteristics in both the
          time and frequency domains [9]. Detected pulses are converted to time-frequency features
          and plotted as groups by similarity, so pulses from different PD sources, or from
          external noise, can be separated more clearly than with the phase-resolved pattern
          alone. The technique is used in commercial PD instruments, notably TECHIMP-based systems.
        </p>

        <h5>Gap-time</h5>
        <p>
          Gap-time is the time separation between two discharge clusters that appear in{' '}
          <b>opposite polarity regions</b> of the same phase-resolved pattern [7], [8]. It is
          measured in milliseconds, from the end boundary of the first cluster to the starting
          boundary of the following cluster. PD amplitude and pulse repetition can shift with
          sensor response, trigger setting, measuring circuit and noise conditions; the phase
          position and separation of the clusters are comparatively more stable, which is why
          gap-time is used here as an additional quantitative indicator of PD development.
        </p>
      </section>

      {/* ================= WORKFLOW ================= */}
      <section id="help-workflow">
        <h4>Workflow Overview</h4>
        <table className="kv">
          <tbody>
            <tr>
              <td className="k">1 · Case Input</td>
              <td>
                Upload a PRPD image, or PRPD + TF map, or open a case from the Folder / Batch
                queue. One file runs the PRPD-only model; two files auto-switch to Hybrid.
              </td>
            </tr>
            <tr>
              <td className="k">2 · Classification Result</td>
              <td>
                Read-only confidence scores, the PRPD plot, and the decision criteria used to reach
                the final result.
              </td>
            </tr>
            <tr>
              <td className="k">3 · PD Source</td>
              <td>
                A rule-based PD source suggestion from the confidence scores. The reviewer confirms
                or overrides it.
              </td>
            </tr>
            <tr>
              <td className="k">4 · Plot Calibration</td>
              <td>Align the frame lines to the plot&apos;s phase (0-360°) and amplitude axes.</td>
            </tr>
            <tr>
              <td className="k">5 · Gap-Time Detection</td>
              <td>
                Mark the boundary between discharge clusters to measure gap angle, gap time and
                severity.
              </td>
            </tr>
            <tr>
              <td className="k">6 · Case Summary</td>
              <td>A combined chart and full data table covering every step.</td>
            </tr>
            <tr>
              <td className="k">7 · Reviewer &amp; Sign-off</td>
              <td>The signed-in account is the reviewer of record. Set the status and save.</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-[10px]">
          Steps 3 and 5 are deliberately <b>user-confirmed</b>. Automatic gap-time lines can be
          misplaced when cluster boundaries are unclear, so the confirmation step is what prevents
          an unreliable severity value from being recorded.
        </p>
      </section>

      {/* ================= CLASSIFICATION ================= */}
      <section id="help-classification">
        <h4>Understanding the Classification Result</h4>
        <p>
          Every case is scored under one fixed rule: <b>TopClass {topclass}%</b>, matching the CMD
          FINAL V2 run that produced the imported dataset and the method reported in the paper. The
          rule is not selectable per case, so results stay comparable across the whole dataset.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Threshold</th>
              <th>Rule</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>TopClass</b>, the applied rule
              </td>
              <td>&gt; {topclass}%</td>
              <td>
                All three classes ≤ {topclass}% → &quot;Non-identified&quot;; otherwise the top
                class wins.
              </td>
            </tr>
            <tr>
              <td>Internal sanity check</td>
              <td>
                {confidence}-{internalHigh}%
              </td>
              <td>
                When Internal confidence falls in this band, the quadrant point-mass ratio must
                reach 0.15 on every side, or the result is overridden to
                &quot;Non-identified&quot;.
              </td>
            </tr>
          </tbody>
        </table>

        <h5>Model &amp; dataset provenance</h5>
        <p>
          Both models were trained on <b>994 laboratory cases</b> measured on basic PD test objects
          under IEC 60270 (320 corona, 346 surface and 328 internal), split{' '}
          <b>64% training / 20% testing / 16% validation</b>. The output layer uses a sigmoid
          activation, so the three confidence scores are independent and are not required to sum to
          100%.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Model</th>
              <th>Input</th>
              <th>Accuracy</th>
              <th>Macro P / R / F1</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>PRPD-only</td>
              <td>One PRPD image</td>
              <td>96.15%</td>
              <td>96.75% / 95.83% / 96.07%</td>
            </tr>
            <tr>
              <td>Hybrid PRPD + TF Map</td>
              <td>Paired PRPD and TF Map</td>
              <td>96.15%</td>
              <td>96.75% / 95.83% / 96.07%</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-[10px] text-[12px] text-slate-400">
          Measured on 104 test samples. The two models scored identically on this test set. They
          differ in the input conditions they can be applied to, not in demonstrated accuracy.
        </p>
      </section>

      {/* ================= GAP-TIME & SEVERITY ================= */}
      <section id="help-severity">
        <h4>Understanding Gap-Time &amp; Severity</h4>
        <p>
          Gap angle (°) becomes gap time (ms) assuming one 50 Hz mains cycle = {cycle} ms:{' '}
          <code>gap_time_ms = |gap_angle_deg| × {cycle} ms ÷ 360°</code>. The band and the
          confirmed PD source group then determine severity.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>PD source group</th>
              <th>Gap time</th>
              <th>Gap angle</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowSpan={3}>Group 1: Corona / Surface</td>
              <td>&gt; {moderateMs} ms</td>
              <td>&gt; {deg(moderateMs)}°</td>
              <td>
                <span className="pill pill-green">Initial</span>
              </td>
            </tr>
            <tr>
              <td>{highMs} - {moderateMs} ms</td>
              <td>{deg(highMs)}° - {deg(moderateMs)}°</td>
              <td>
                <span className="pill pill-amber">Moderate</span>
              </td>
            </tr>
            <tr>
              <td>&lt; {highMs} ms</td>
              <td>&lt; {deg(highMs)}°</td>
              <td>
                <span className="pill pill-red">High</span>
              </td>
            </tr>
            <tr>
              <td rowSpan={3}>Group 2: Joint / Internal</td>
              <td>&gt; {moderateMs} ms</td>
              <td>&gt; {deg(moderateMs)}°</td>
              <td>
                <span className="pill pill-amber">Moderate</span>
              </td>
            </tr>
            <tr>
              <td>{highMs} - {moderateMs} ms</td>
              <td>{deg(highMs)}° - {deg(moderateMs)}°</td>
              <td>
                <span className="pill pill-red">High</span>
              </td>
            </tr>
            <tr>
              <td>&lt; {highMs} ms</td>
              <td>&lt; {deg(highMs)}°</td>
              <td>
                <span className="pill pill-red">High</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-[10px]">
          If only one discharge cluster is present, gap-time cannot be measured. The system
          recommends marking the case <b>Not Measurable</b> with reason{' '}
          <code>single_discharge_cluster</code>.
        </p>
        <div className="callout callout-amber mt-[12px]">
          <b>Initial / Moderate / High are the criteria of this framework, not an international
          standard.</b>{' '}
          They come from the gap-time severity table developed in this project and apply to the
          conditions it was validated under. A gap time below {highMs} ms does <b>not</b> on its own prove
          that a defect is severe, and a gap time above {moderateMs} ms does not prove that it is safe. Read
          the band together with the confirmed PD source, the measurement conditions, and the
          history of the asset.
        </div>
      </section>

      {/* ================= SCOPE & LIMITATIONS ================= */}
      <section id="help-limits">
        <h4>Scope &amp; Limitations</h4>

        <h5>1 · Input images</h5>
        <ul className="help-bullets">
          <li>
            The image must be a <b>PRPD pattern</b> suitable for analysis, one showing discharge
            clusters at interpretable phase positions, not a different kind of graph or signal
            plot.
          </li>
          <li>
            The PRPD should contain discharge activity on <b>both the positive and the negative
            polarity</b>, since gap-time analysis relies on two clusters of opposite polarity.
          </li>
          <li>
            Image quality must be sufficient. Low resolution, cropped edges, overlaid text or
            symbols, and heavy noise all reduce classification quality.
          </li>
          <li>
            Training images and application images should look alike. Plots from a different
            instrument, or with a markedly different PRPD style from the training data, can degrade
            the result.
          </li>
        </ul>

        <h5>2 · PD types covered</h5>
        <ul className="help-bullets">
          <li>
            The models are trained on <b>three classes only</b>: Corona, Surface and Internal
            discharge. They are not trained for every PD type that exists.
          </li>
          <li>
            <b>Mixed PD or multiple simultaneous PD sources may be classified incorrectly</b>, as
            the training database consists of single-type (pure) PD cases.
          </li>
        </ul>

        <h5>3 · PRPD and TF Map pairing</h5>
        <ul className="help-bullets">
          <li>
            The Hybrid model uses the PRPD together with the TF Map to add information to the
            classification. It is not claimed to be the most accurate option in all cases. On the
            reported test set both models scored identically.
          </li>
          <li>
            The Hybrid model is appropriate when the PRPD and TF Map are a{' '}
            <b>paired input from the same measurement</b>.
          </li>
          <li>
            If the PRPD and the TF Map do not come from the same case, they must{' '}
            <b>not</b> be paired for training or inference.
          </li>
          <li>
            For mixed PD, the Hybrid model may add useful information when the PRPD pattern is
            complex, but it does not guarantee correct classification of mixed PD.
          </li>
        </ul>

        <h5>4 · Training</h5>
        <ul className="help-checklist">
          <li>Data must be arranged in the directory structure the system defines.</li>
          <li>Data must be separated correctly by class.</li>
          <li>Image labels must be verified before training starts.</li>
          <li>
            The system uses a fixed split of <b>64% training / 20% testing / 16% validation</b>.
          </li>
          <li>
            Each class should hold enough samples, and class counts should not be far out of
            balance with one another.
          </li>
          <li>
            The same image, or images derived from the same measurement, must never appear in
            both the training and the testing set. That is <b>data leakage</b>, and it inflates the
            evaluation scores.
          </li>
        </ul>

        <h5>5 · AI results</h5>
        <ul className="help-bullets">
          <li>
            The AI result is a <b>preliminary assessment, not a diagnosis</b>.
          </li>
          <li>Results vary with the quality and the characteristics of the input data.</li>
          <li>
            A confidence value does <b>not</b> mean the system can confirm that the PD type is
            correct with 100% certainty.
          </li>
          <li>
            If no class exceeds the configured threshold, the result is reported as{' '}
            <b>Non-identified</b> rather than guessed.
          </li>
          <li>
            The user must review the result together with the measurement data and a qualified
            expert before using it in any engineering decision.
          </li>
        </ul>

        <h5>6 · Gap-time and severity</h5>
        <ul className="help-bullets">
          <li>
            Gap-time is an indicator for <b>preliminary severity assessment</b>.
          </li>
          <li>
            The system must be able to identify two discharge clusters of opposite polarity before
            a gap-time can be calculated.
          </li>
          <li>
            If only one cluster is present, or the cluster boundaries cannot be clearly defined,
            gap-time cannot be computed.
          </li>
          <li>
            Such cases are reported as <b>Not measurable</b>, not as a low or high severity.
          </li>
          <li>
            Initial / Moderate / High are the assessment bands of this framework and should not be
            read as an international standard for all PD systems.
          </li>
        </ul>
      </section>

      {/* ================= DATA HANDLING ================= */}
      <section id="help-data">
        <h4>Data Handling &amp; Privacy</h4>
        <p>
          Consent is collected in a separate dialog when you enter the system, and it is recorded
          as two independent choices. Accepting the terms of use is required in order to use the
          system; allowing your uploads to be used for dataset and model development is optional
          and can be declined without affecting any analysis feature.
        </p>
        <p className="mt-[10px]">If you give the optional consent, the data retained is:</p>
        <table className="kv">
          <tbody>
            <tr>
              <td className="k">PRPD image</td>
              <td>The uploaded phase-resolved plot.</td>
            </tr>
            <tr>
              <td className="k">TF Map</td>
              <td>The paired time-frequency map, when one is uploaded.</td>
            </tr>
            <tr>
              <td className="k">Class label</td>
              <td>The PD source you confirm during review.</td>
            </tr>
            <tr>
              <td className="k">Model result</td>
              <td>Confidence scores, final result, gap-time and severity.</td>
            </tr>
            <tr>
              <td className="k">Related metadata</td>
              <td>Case name, timestamps, calibration values and reviewer account.</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-[10px]">
          No personal data beyond the reviewer account needed to attribute a sign-off is collected.
          Do not upload images that contain personal or commercially confidential information in
          the plot itself.
        </p>
      </section>

      {/* ================= REFERENCES ================= */}
      <section id="help-refs">
        <h4>References</h4>
        <ol className="m-0 list-decimal space-y-[6px] pl-[18px] text-[11.5px] leading-[1.55] text-slate-500">
          <li>
            <i>High-voltage Test Techniques: Partial Discharge Measurements</i>, IEC 60270, Dec.
            2000.
          </li>
          <li>
            <i>On-site Partial Discharge Assessment of HV and EHV Cable Systems</i>, CIGRE Tech.
            Brochure 728, Working Group B1.28, Paris, France, 2018.
          </li>
          <li>
            <i>Knowledge Rules for Partial Discharge Diagnosis in Service</i>, CIGRE Tech. Brochure
            226, Task Force 15.11/33.03.02, Paris, France, 2003.
          </li>
          <li>
            R. Sahoo and S. Karmakar, &quot;Investigation of electrical tree growth characteristics
            and partial discharge pattern analysis using deep neural network,&quot;{' '}
            <i>Electr. Power Syst. Res.</i>, vol. 220, Art. no. 109287, Jul. 2023.
          </li>
          <li>
            Y. Li, J. Han, Y. Du, and H. Jin, &quot;Time-frequency maps for multiple partial
            discharge sources separation in cable terminations,&quot;{' '}
            <i>IEEE Trans. Power Del.</i>, vol. 38, no. 3, pp. 2228-2231, Jun. 2023.
          </li>
          <li>
            M. Karimi, M. Majidi, H. MirSaeedi, M. M. Arefi, and M. Oskuoee, &quot;A novel
            application of deep belief networks in learning partial discharge patterns for
            classifying corona, surface, and internal discharges,&quot;{' '}
            <i>IEEE Trans. Ind. Electron.</i>, vol. 67, no. 4, pp. 3277-3287, Apr. 2020.
          </li>
          <li>
            N. Panmala, T. Suwanasri, P. Fuangpian, and C. Suwanasri, &quot;Partial discharge
            measurement with gap time analysis to determine severity of defect in rotating
            machines,&quot; in <i>Proc. 10th Int. Conf. Condition Monit. Diagnosis (CMD)</i>, 2024,
            pp. 234-237.
          </li>
          <li>
            P. Fuangpian, T. Suwanasri, and C. Suwanasri, &quot;Partial discharge severity analysis
            based on repetition rate, amplitude and gap distance in MV motor,&quot; in{' '}
            <i>Proc. 21st Int. Symp. High Voltage Eng.</i>, Budapest, Hungary, Aug. 2019, vol. 2,
            pp. 704-717.
          </li>
          <li>
            G. C. Montanari, A. Cavallini, and F. Puletti, &quot;A new approach to partial
            discharge testing of HV cable systems,&quot; <i>IEEE Electr. Insul. Mag.</i>, vol. 22,
            no. 1, pp. 14-23, Jan./Feb. 2006.
          </li>
        </ol>
      </section>
    </div>
  );
}
