/**
 * T3.8 — Prompt registry: all LLM prompts defined and renderable.
 *
 * Category A: fixture-based. Verifies all 8 prompts exist, have
 * correct placeholders, and renderPrompt substitutes correctly.
 *
 * Source: brain/src/prompts.py
 */

import {
  PROMPT_REGISTRY,
  PROMPT_NAMES,
  getPrompt,
  renderPrompt,
  PERSONA_CLASSIFY,
  CONTENT_ENRICH,
  SILENCE_CLASSIFY,
  GUARD_SCAN,
  ANTI_HER,
  REMINDER_PLAN,
  NUDGE_ASSEMBLE,
  CHAT_SYSTEM,
} from '../../src/llm/prompts';

describe('Prompt Registry', () => {
  describe('completeness', () => {
    it('has exactly 8 prompts', () => {
      expect(PROMPT_NAMES.length).toBe(8);
    });

    const expectedNames = [
      'PERSONA_CLASSIFY',
      'CONTENT_ENRICH',
      'SILENCE_CLASSIFY',
      'GUARD_SCAN',
      'ANTI_HER',
      'REMINDER_PLAN',
      'NUDGE_ASSEMBLE',
      'CHAT_SYSTEM',
    ];

    for (const name of expectedNames) {
      it(`includes "${name}"`, () => {
        expect(PROMPT_NAMES).toContain(name);
        expect(PROMPT_REGISTRY[name]).toBeTruthy();
      });
    }
  });

  describe('getPrompt', () => {
    it('returns prompt by name', () => {
      const prompt = getPrompt('PERSONA_CLASSIFY');
      expect(prompt).toBe(PERSONA_CLASSIFY);
    });

    it('throws for unknown prompt name', () => {
      expect(() => getPrompt('NONEXISTENT')).toThrow('unknown prompt');
    });
  });

  describe('renderPrompt', () => {
    it('substitutes single variable', () => {
      const result = renderPrompt('Hello {{name}}!', { name: 'Alice' });
      expect(result).toBe('Hello Alice!');
    });

    it('substitutes multiple variables', () => {
      const result = renderPrompt(
        '{{type}} from {{sender}}',
        { type: 'Email', sender: 'Bob' },
      );
      expect(result).toBe('Email from Bob');
    });

    it('throws on missing variable', () => {
      expect(() => renderPrompt('Hello {{name}}!', {}))
        .toThrow('missing variable "{{name}}"');
    });

    it('leaves text without placeholders unchanged', () => {
      expect(renderPrompt('No placeholders here', {}))
        .toBe('No placeholders here');
    });

    it('handles empty values', () => {
      expect(renderPrompt('Subject: {{subject}}', { subject: '' }))
        .toBe('Subject: ');
    });
  });

  describe('PERSONA_CLASSIFY', () => {
    it('contains persona_list placeholder', () => {
      expect(PERSONA_CLASSIFY).toContain('{{persona_list}}');
    });

    it('contains item metadata placeholders', () => {
      expect(PERSONA_CLASSIFY).toContain('{{type}}');
      expect(PERSONA_CLASSIFY).toContain('{{source}}');
      expect(PERSONA_CLASSIFY).toContain('{{sender}}');
      expect(PERSONA_CLASSIFY).toContain('{{subject}}');
    });

    it('instructs JSON output format', () => {
      expect(PERSONA_CLASSIFY).toContain('"persona"');
      expect(PERSONA_CLASSIFY).toContain('"confidence"');
    });

    it('includes "NEVER invent" guard rail', () => {
      expect(PERSONA_CLASSIFY).toMatch(/never\s+invent/i);
    });
  });

  describe('CONTENT_ENRICH', () => {
    it('contains body placeholder', () => {
      expect(CONTENT_ENRICH).toContain('{{body}}');
    });

    it('defines L0 and L1 output', () => {
      expect(CONTENT_ENRICH).toContain('"l0"');
      expect(CONTENT_ENRICH).toContain('"l1"');
    });

    it('includes has_event field', () => {
      expect(CONTENT_ENRICH).toContain('"has_event"');
    });
  });

  describe('SILENCE_CLASSIFY', () => {
    it('defines three tiers', () => {
      expect(SILENCE_CLASSIFY).toContain('1 = Fiduciary');
      expect(SILENCE_CLASSIFY).toContain('2 = Solicited');
      expect(SILENCE_CLASSIFY).toContain('3 = Engagement');
    });

    it('references Silence First principle', () => {
      expect(SILENCE_CLASSIFY).toContain('Silence First');
    });
  });

  describe('GUARD_SCAN', () => {
    it('contains response placeholder', () => {
      expect(GUARD_SCAN).toContain('{{response}}');
    });

    it('lists all 5 violation types', () => {
      expect(GUARD_SCAN).toContain('Therapy simulation');
      expect(GUARD_SCAN).toContain('Engagement hooks');
      expect(GUARD_SCAN).toContain('Intimacy simulation');
      expect(GUARD_SCAN).toContain('Unsolicited recommendations');
      expect(GUARD_SCAN).toContain('Hallucinated trust');
    });
  });

  describe('ANTI_HER', () => {
    it('references Law 2', () => {
      expect(ANTI_HER).toContain('Law 2');
    });

    it('contains contact_names placeholder', () => {
      expect(ANTI_HER).toContain('{{contact_names}}');
    });

    it('instructs redirect to real people', () => {
      expect(ANTI_HER).toMatch(/redirect/i);
    });
  });

  describe('REMINDER_PLAN', () => {
    it('contains event_date placeholder', () => {
      expect(REMINDER_PLAN).toContain('{{event_date}}');
    });

    it('defines reminder JSON output', () => {
      expect(REMINDER_PLAN).toContain('"reminders"');
      expect(REMINDER_PLAN).toContain('"due_relative"');
    });
  });

  describe('NUDGE_ASSEMBLE', () => {
    it('contains contact_name placeholder', () => {
      expect(NUDGE_ASSEMBLE).toContain('{{contact_name}}');
    });

    it('includes "NEVER fabricate" guard rail', () => {
      expect(NUDGE_ASSEMBLE).toMatch(/never\s+fabricate/i);
    });

    it('supports null return for insufficient context', () => {
      expect(NUDGE_ASSEMBLE).toContain('null');
    });
  });

  describe('CHAT_SYSTEM', () => {
    it('contains vault_context placeholder', () => {
      expect(CHAT_SYSTEM).toContain('{{vault_context}}');
    });

    it('includes persona boundary rule', () => {
      expect(CHAT_SYSTEM).toContain('persona boundaries');
    });

    it('includes Law 2 reference', () => {
      expect(CHAT_SYSTEM).toContain('Law 2');
    });

    it('includes "NEVER invent" guard rail', () => {
      expect(CHAT_SYSTEM).toMatch(/never\s+invent/i);
    });
  });

  describe('all prompts are non-empty strings', () => {
    for (const [name, template] of Object.entries(PROMPT_REGISTRY)) {
      it(`${name} is a non-empty string`, () => {
        expect(typeof template).toBe('string');
        expect(template.length).toBeGreaterThan(50);
      });
    }
  });
});
