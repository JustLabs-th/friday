// Sample replies used to review how Markdown, code, tables and charts render.
// They did not come from Codex.
const fence = '`'.repeat(3);

export const sampleReply = `นี่เป็นข้อความตัวอย่างสำหรับดูหน้าตาของคำตอบ ยังไม่ได้มาจาก Codex จริง

## สรุปผลเปรียบเทียบ

ผลการทดสอบ **harness** ทั้งสามตัว (ตัวเลขสมมติ) มี \`p50\` และ \`p95\` ดังนี้:

| Harness | p50 (ms) | p95 (ms) | สถานะ |
| :-- | --: | --: | :-: |
| Alpha | 12 | 30 | ✅ |
| Beta | 18 | 44 | ✅ |
| Gamma | 25 | 90 | ⚠️ |

${fence}chart
{"type": "bar", "title": "Latency (ms)", "x": "harness", "series": ["p50", "p95"], "data": [
  {"harness": "Alpha", "p50": 12, "p95": 30},
  {"harness": "Beta", "p50": 18, "p95": 44},
  {"harness": "Gamma", "p50": 25, "p95": 90}
]}
${fence}

### ขั้นตอนถัดไป

1. รัน benchmark ซ้ำ 3 รอบ
2. เก็บผลลง \`bench/results.csv\`
3. เทียบ [เอกสารของ Tauri](https://tauri.app/start/)

รายการตรวจสอบ:

- [x] ตั้งค่า harness
- [ ] สรุปรายงาน

> หมายเหตุ: ตัวเลขทั้งหมดเป็นข้อมูลตัวอย่าง

${fence}ts
export async function runBenchmark(name: string): Promise<number> {
  const start = performance.now();
  await harness[name].run(); // the same workload for each
  return performance.now() - start;
}
${fence}
`;

export const sampleCharts = `${fence}chart
{"type": "line", "title": "Throughput over time", "x": "minute", "series": ["Alpha", "Beta"], "data": [
  {"minute": "0", "Alpha": 40, "Beta": 32},
  {"minute": "1", "Alpha": 55, "Beta": 41},
  {"minute": "2", "Alpha": 61, "Beta": 58},
  {"minute": "3", "Alpha": 58, "Beta": 66}
]}
${fence}

${fence}chart
{"type": "area", "title": "Memory (MB)", "x": "minute", "series": ["Alpha"], "data": [
  {"minute": "0", "Alpha": 120}, {"minute": "1", "Alpha": 180}, {"minute": "2", "Alpha": 150}, {"minute": "3", "Alpha": 210}
]}
${fence}

${fence}chart
{"type": "pie", "title": "Share of runs", "nameKey": "harness", "valueKey": "runs", "data": [
  {"harness": "Alpha", "runs": 50}, {"harness": "Beta", "runs": 30}, {"harness": "Gamma", "runs": 20}
]}
${fence}
`;
