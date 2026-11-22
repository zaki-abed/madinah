import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

/** سؤال في الطرفية. مع hidden لا يظهر ما يُكتب (لكلمات المرور). */
export function ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (options.hidden) process.stdout.write('\n');
      resolve(answer);
    });
    muted = options.hidden === true;
  });
}
