import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const componentPath = path.join(
  root,
  'apps/dashboard/src/components/MetricConfigPanel.jsx'
)
const component = fs.readFileSync(componentPath, 'utf8')

const removedDescriptions = [
  'ชื่อที่ใช้แสดงใน Dashboard และ History',
  'หน่วยที่แสดงต่อท้ายค่าที่วัดได้',
  'จำนวนตำแหน่งทศนิยมสำหรับการแสดงผล',
  'Icon ที่ใช้แทน Value ในหน้าจอแสดงผล',
]

const assertions = [
  [
    !component.includes("from '../utils/uiFeedback'"),
    'MetricConfigPanel no longer imports floating toast helpers.',
  ],
  [
    !component.includes('showSuccessToast('),
    'Save Values and Save Alarms no longer show a floating success toast.',
  ],
  [
    !component.includes('showErrorToast('),
    'MetricConfigPanel no longer shows duplicate floating error toasts.',
  ],
  [
    component.includes('{panelMessage && ('),
    'Inline panel feedback remains available as the single feedback location.',
  ],
  [
    component.includes('<span>Value Name</span>'),
    'Value Name label remains.',
  ],
  [
    component.includes('<span>Unit</span>'),
    'Unit label remains.',
  ],
  [
    component.includes('<span>Decimals</span>'),
    'Decimals label remains.',
  ],
  [
    component.includes('<span>Icon</span>'),
    'Icon label remains.',
  ],
  ...removedDescriptions.map((description) => [
    !component.includes(description),
    `Removed field description: ${description}`,
  ]),
]

const failed = assertions.filter(([passed]) => !passed)

if (failed.length > 0) {
  for (const [, message] of failed) {
    console.error(`FAIL: ${message}`)
  }
  process.exit(1)
}

for (const [, message] of assertions) {
  console.log(`PASS: ${message}`)
}

console.log(
  'PASS: Values feedback is no longer duplicated and field descriptions are removed.'
)
