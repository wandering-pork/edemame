import type { WorkflowTemplate } from '../types';

/**
 * MVP visa subclass templates per the pitch deck (Slide 9):
 * 186 (ENS), 482 (TSS), 490 (Skilled Regional), 820 (Partner)
 */
export function seedDefaultTemplates(): WorkflowTemplate[] {
  return [
    {
      id: 'tpl-186',
      title: 'Employer Nomination Scheme (Subclass 186)',
      description: 'Permanent residency visa for skilled workers nominated by their employer.',
      visaSubclass: '186',
      userId: null,
      steps: [
        { title: 'Initial Consultation', description: 'Assess eligibility, discuss pathway (Direct Entry vs TRT), gather employer details.' },
        { title: 'Skills Assessment', description: 'Lodge skills assessment with relevant assessing authority (if Direct Entry stream).' },
        { title: 'English Language Test', description: 'Book and complete IELTS/PTE/TOEFL — competent English required.' },
        { title: 'Employer Nomination (Form 186N)', description: 'Employer lodges nomination with Department of Home Affairs.' },
        { title: 'Nomination Approval Wait', description: 'Monitor nomination status and respond to any requests for information.' },
        { title: 'Visa Application (Form 186V)', description: 'Lodge primary applicant visa application with all supporting documents.' },
        { title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'Obtain AFP National Police Check and overseas clearances.' },
        { title: 'Application Follow-Up', description: 'Monitor processing and respond to any further requests.' },
        { title: 'Grant & Settlement', description: 'Visa grant notification — advise on travel and settlement obligations.' },
      ],
    },
    {
      id: 'tpl-482',
      title: 'Temporary Skill Shortage (Subclass 482)',
      description: 'Temporary work visa allowing employers to sponsor skilled overseas workers.',
      visaSubclass: '482',
      userId: null,
      steps: [
        { title: 'Initial Consultation', description: 'Assess eligibility, determine stream (Short-term/Medium-term/Labour Agreement).' },
        { title: 'Sponsor Approval', description: 'Ensure sponsoring employer holds an approved Standard Business Sponsorship (SBS).' },
        { title: 'Labour Market Testing', description: 'Employer demonstrates genuine attempts to recruit locally (advertising evidence).' },
        { title: 'Nomination Lodgement', description: 'Employer lodges nomination for the specific occupation and position.' },
        { title: 'Skills Assessment (if required)', description: 'Some occupations require a formal skills assessment.' },
        { title: 'English Language Test', description: 'Applicant completes required English proficiency test.' },
        { title: 'Visa Application', description: 'Lodge visa application with work history, qualifications, and character documents.' },
        { title: 'Health Examinations', description: 'Complete Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'AFP National Police Check and any overseas clearances.' },
        { title: 'Grant & Conditions', description: 'Visa grant — advise on visa conditions, employer obligations, and pathway to PR.' },
      ],
    },
    {
      id: 'tpl-490',
      title: 'Skilled Work Regional (Subclass 490)',
      description: 'Points-tested provisional visa for skilled workers nominated by a state/territory or sponsored by an eligible family member in regional Australia.',
      visaSubclass: '490',
      userId: null,
      steps: [
        { title: 'Initial Consultation', description: 'Assess points score, eligible occupations, and state nomination options.' },
        { title: 'Skills Assessment', description: 'Lodge skills assessment with the relevant assessing authority.' },
        { title: 'English Language Test', description: 'Complete IELTS/PTE — higher scores earn more points.' },
        { title: 'EOI Submission (SkillSelect)', description: 'Submit Expression of Interest in SkillSelect with points claim.' },
        { title: 'State Nomination Application', description: 'Apply to the chosen state/territory for nomination (adds 15 points).' },
        { title: 'Invitation to Apply', description: 'Receive and accept invitation — 60-day lodgement window.' },
        { title: 'Visa Application', description: 'Lodge full visa application with evidence of points claims.' },
        { title: 'Health Examinations', description: 'Arrange Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'AFP check and overseas police clearances for all countries lived in 12+ months.' },
        { title: 'Grant & Regional Obligations', description: 'Visa grant — advise on 3-year regional residence obligation and pathway to 191.' },
      ],
    },
    {
      id: 'tpl-820',
      title: 'Partner Visa — Onshore (Subclass 820)',
      description: 'Temporary partner visa for applicants in Australia in a genuine relationship with an Australian citizen, PR holder, or eligible NZ citizen.',
      visaSubclass: '820',
      userId: null,
      steps: [
        { title: 'Initial Consultation', description: 'Assess relationship genuineness, discuss evidence requirements and timeline.' },
        { title: 'Relationship Evidence Collection', description: 'Gather joint finances, cohabitation proof, social evidence, photos, travel history.' },
        { title: 'Statutory Declarations', description: 'Prepare Form 888 statements from friends and family attesting to relationship.' },
        { title: 'Form 80 & Form 1221', description: 'Complete personal particulars and additional personal particulars forms.' },
        { title: 'Sponsor Application', description: 'Australian partner lodges sponsorship approval (character + history checks).' },
        { title: 'Visa Application', description: 'Lodge combined 820/801 application with full evidence package.' },
        { title: 'Health Examinations', description: 'Complete Bupa medical exams for all applicants.' },
        { title: 'Police Clearances', description: 'AFP National Police Check and overseas clearances.' },
        { title: 'Interview (if required)', description: 'Attend departmental interview if requested — prepare applicant and sponsor.' },
        { title: 'Temporary Grant (820)', description: '820 grant — advise on work rights and bridging visa. 801 eligibility in ~2 years.' },
      ],
    },
  ];
}
