/** Readable canvas labels, not symbolic algebra. Unsupported notation remains visible verbatim. */
export function sheetMathText(source: string): string {
  if (source.length > 8000) return source;
  const scripts = {
    '^': ['0123456789+-=()ni', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ'],
    _: ['0123456789+-=()aehijklmnoprstuvx', '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'],
  } as const;
  const symbols: Record<string, string> = {
    cdot: '·',
    times: '×',
    div: '÷',
    pm: '±',
    mp: '∓',
    le: '≤',
    leq: '≤',
    ge: '≥',
    geq: '≥',
    ne: '≠',
    neq: '≠',
    approx: '≈',
    equiv: '≡',
    infty: '∞',
    pi: 'π',
    alpha: 'α',
    beta: 'β',
    gamma: 'γ',
    Delta: 'Δ',
    delta: 'δ',
    theta: 'θ',
    lambda: 'λ',
    mu: 'μ',
    sigma: 'σ',
    to: '→',
    rightarrow: '→',
    Rightarrow: '⇒',
    Leftrightarrow: '⇔',
    leftarrow: '←',
    in: '∈',
    notin: '∉',
    cup: '∪',
    cap: '∩',
    emptyset: '∅',
    ldots: '…',
    dots: '…',
    vert: '|',
    lvert: '|',
    rvert: '|',
    quad: ' ',
    qquad: ' ',
    left: '',
    right: '',
    displaystyle: '',
  };
  const script = (kind: '^' | '_', body: string) => {
    const [from, to] = scripts[kind];
    return body && [...body].every((c) => from.includes(c))
      ? [...body].map((c) => to[from.indexOf(c)]).join('')
      : `${kind}(${body})`;
  };
  function render(input: string, depth: number): string {
    if (depth > 12) return input;
    const argument = (from: number) => {
      let start = from;
      while (/\s/.test(input[start] || '') && start < input.length) start++;
      if (start >= input.length) return;
      if (input[start] !== '{') {
        // An unbraced TeX argument is exactly one token, not a whole number.
        if (input[start] === '\\') return;
        return { body: input[start], end: start + 1 };
      }
      let balance = 1,
        end = start + 1;
      while (end < input.length && balance) {
        if (input[end] === '{' && input[end - 1] !== '\\') balance++;
        if (input[end] === '}' && input[end - 1] !== '\\') balance--;
        end++;
      }
      return balance ? undefined : { body: input.slice(start + 1, end - 1), end };
    };
    let out = '';
    for (let i = 0; i < input.length; ) {
      const ch = input[i];
      if (ch === '^' || ch === '_') {
        const arg = argument(i + 1);
        if (arg) {
          out += script(ch, render(arg.body, depth + 1));
          i = arg.end;
          continue;
        }
      }
      if (ch !== '\\') {
        out += ch;
        i++;
        continue;
      }
      const command = input.slice(i + 1).match(/^[A-Za-z]+|^./)?.[0];
      if (!command) {
        out += ch;
        i++;
        continue;
      }
      const end = i + command.length + 1;
      if (['frac', 'dfrac', 'tfrac'].includes(command)) {
        const numerator = argument(end),
          denominator = numerator && argument(numerator.end);
        if (numerator && denominator) {
          out += `(${render(numerator.body, depth + 1)})/(${render(denominator.body, depth + 1)})`;
          i = denominator.end;
          continue;
        }
      }
      if (command === 'sqrt') {
        let from = end,
          degree = '';
        if (input[from] === '[') {
          const close = input.indexOf(']', from + 1);
          if (close > from) {
            degree = input.slice(from + 1, close);
            from = close + 1;
          }
        }
        const arg = argument(from);
        if (arg) {
          const radical =
            !degree || degree === '2'
              ? '√'
              : degree === '3'
                ? '∛'
                : degree === '4'
                  ? '∜'
                  : `корень степени (${render(degree, depth + 1)}) из `;
          out += `${radical}(${render(arg.body, depth + 1)})`;
          i = arg.end;
          continue;
        }
      }
      if (['text', 'mathrm', 'mathbf', 'mathit', 'operatorname'].includes(command)) {
        const arg = argument(end);
        if (arg) {
          out += render(arg.body, depth + 1);
          i = arg.end;
          continue;
        }
      }
      if (command in symbols) out += symbols[command];
      else if (['(', ')', '[', ']'].includes(command)) {
        /* TeX math delimiters. */
      } else if ([',', ';', '!', ' '].includes(command)) out += ' ';
      else if (['%', '{', '}', '$'].includes(command)) out += command;
      else out += input.slice(i, end);
      i = end;
    }
    return out;
  }
  // Dollar delimiters only when paired. A standalone currency symbol is untouched.
  return render(
    source.replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g, (_, block, inline) => block ?? inline),
    0,
  );
}
