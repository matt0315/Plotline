import type { DocField, FieldType } from '../types/event'
import { uid } from '../lib/id'

type T = [FieldType, string, string[]?]

export interface DocTemplate {
  key: string
  title: string
  description: string
  fields: T[]
}

const YN = ['Yes', 'No', 'N/A']

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    key: 'risk',
    title: 'Risk assessment',
    description: 'Identify hazards, who is at risk, and the controls in place.',
    fields: [
      ['text', 'Assessed by'],
      ['date', 'Date of assessment'],
      ['heading', 'Hazards'],
      ['longtext', 'Slips, trips and falls — controls'],
      ['longtext', 'Crowd movement and capacity — controls'],
      ['longtext', 'Electrical and generators — controls'],
      ['longtext', 'Weather (wind, heat, rain) — controls'],
      ['longtext', 'Fire and evacuation — controls'],
      ['longtext', 'Food safety and allergens — controls'],
      ['choice', 'Overall risk rating', ['Low', 'Medium', 'High']],
      ['signature', 'Signed'],
    ],
  },
  {
    key: 'site-safety',
    title: 'Site safety check',
    description: 'Walk the site before doors open.',
    fields: [
      ['text', 'Checked by'],
      ['choice', 'Fire exits clear and signed', YN],
      ['choice', 'Extinguishers in place and in date', YN],
      ['choice', 'Cables covered or flown', YN],
      ['choice', 'Structures certified and anchored', YN],
      ['choice', 'First aid point staffed', YN],
      ['choice', 'Accessible route clear', YN],
      ['photo', 'Photo of any issue'],
      ['longtext', 'Notes / actions'],
      ['signature', 'Signed'],
    ],
  },
  {
    key: 'crew-signin',
    title: 'Crew sign-in',
    description: 'Crew sign on arrival and complete the briefing.',
    fields: [
      ['text', 'Name'],
      ['text', 'Role'],
      ['text', 'Mobile'],
      ['checkbox', 'I have read the site briefing and emergency procedures'],
      ['signature', 'Signature'],
    ],
  },
  {
    key: 'delivery',
    title: 'Delivery note',
    description: 'Confirm what arrived and its condition.',
    fields: [
      ['text', 'Supplier'],
      ['text', 'Delivered by'],
      ['longtext', 'Items received'],
      ['choice', 'Condition', ['Good', 'Damaged — noted below', 'Incomplete']],
      ['photo', 'Photo of delivery'],
      ['longtext', 'Notes'],
      ['signature', 'Received by'],
    ],
  },
  {
    key: 'pre-event',
    title: 'Pre-event checklist',
    description: 'Final checks on the day.',
    fields: [
      ['checkbox', 'Floor plan matches setup'],
      ['checkbox', 'Place cards and seating chart out'],
      ['checkbox', 'AV and microphones tested'],
      ['checkbox', 'Bar stocked and staff briefed'],
      ['checkbox', 'Signage in place'],
      ['checkbox', 'Supplier contacts confirmed'],
      ['longtext', 'Outstanding items'],
    ],
  },
  {
    key: 'post-event',
    title: 'Post-event report',
    description: 'What went well, what to change next time.',
    fields: [
      ['text', 'Completed by'],
      ['text', 'Actual attendance'],
      ['longtext', 'What went well'],
      ['longtext', 'Issues and incidents'],
      ['longtext', 'Damage or losses'],
      ['longtext', 'Next time'],
    ],
  },
  {
    key: 'client-signoff',
    title: 'Client sign-off',
    description: 'Client approves the final plan.',
    fields: [
      ['text', 'Client name'],
      ['checkbox', 'I approve the floor plan and run sheet as shared'],
      ['checkbox', 'I approve the final guest numbers'],
      ['longtext', 'Comments'],
      ['signature', 'Client signature'],
    ],
  },
]

export const fieldsFrom = (t: DocTemplate): DocField[] =>
  t.fields.map(([type, label, options]) => ({ id: uid('f'), type, label, options, required: false }))
