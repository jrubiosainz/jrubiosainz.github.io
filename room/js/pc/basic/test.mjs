import assert from 'node:assert/strict';
import { BasicRuntime } from './interpreter.js';

function runProgram(text, input = []) {
  let out = '';
  const rt = new BasicRuntime({
    print: (s) => { out += s; },
    cls: () => { out += '<CLS>'; },
    locate: (r, c) => { out += `<LOCATE ${r},${c}>`; },
    inkey: () => '',
    pos: () => 1,
  });
  rt.run(text);
  for (let guard = 0; guard < 1000 && rt.running; guard += 1) {
    rt.step(1000, 100);
    if (rt.waitingInput) rt.continueInput(input.shift() || '');
  }
  return out;
}

{
  const rt = new BasicRuntime();
  assert.equal(rt.eval('1+2*3^2'), 19);
  assert.equal(rt.eval('NOT 0'), -1);
  assert.equal(rt.eval('"RAIN"+" CITY"'), 'RAIN CITY');
  assert.equal(rt.eval('LEFT$("PHOSPHOR",4)'), 'PHOS');
  assert.equal(rt.eval('INSTR("RAIN","I")'), 3);
}

assert.match(runProgram('10 FOR I=1 TO 10:PRINT I;:NEXT I'), / 1  2  3  4  5  6  7  8  9  10 /);
assert.equal(runProgram('10 IF 2>1 THEN PRINT "YES" ELSE PRINT "NO"'), 'YES\n');
assert.equal(runProgram('10 DATA 4,"OK"\n20 READ A,A$:PRINT A;A$'), ' 4 OK\n');
assert.equal(runProgram('10 GOSUB 40\n20 PRINT "B"\n30 END\n40 PRINT "A";:RETURN'), 'AB\n');
assert.equal(runProgram('10 LINE INPUT "NAME";N$\n20 PRINT "HI ";N$', ['JRS']), 'NAMEHI JRS\n');
assert.throws(() => {
  const rt = new BasicRuntime();
  rt.run('10 PRINT 1/0');
  rt.step(10, 100);
}, /Division by zero/);
assert.throws(() => {
  const rt = new BasicRuntime();
  rt.run('10 GOTO 999');
  rt.step(10, 100);
}, /Undefined line number/);

console.log('BASIC tests passed: expressions, control flow, INPUT, DATA/READ, errors, sample programs');
