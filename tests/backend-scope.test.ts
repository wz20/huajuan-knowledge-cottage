import {describe,it,expect} from 'vitest';
import {within} from '../src/worker/database';
import {validate} from '../src/main/validation';
describe('scope boundary',()=>{it('does not confuse sibling prefix with descendant',()=>{expect(within('/notes','/notes/a/b.md')).toBe(true);expect(within('/notes','/notes-other/a.md')).toBe(false);expect(within('/notes','/notes/../secret.md')).toBe(false);});it('rejects invalid stored input before worker calls',()=>{expect(()=>validate('todos.create',{title:' '})).toThrow();expect(()=>validate('games.score',{score:Infinity})).toThrow();expect(()=>validate('settings.zone',{zone:'arbitrary'})).toThrow();expect(validate('todos.create',{title:'  学习  '}).title).toBe('学习');});});

it('validates reminder schedule and snooze fields',()=>{expect(()=>validate('reminders.settings',{kind:'drink',schedule:{enabled:true,start:'25:00',end:'17:00'}})).toThrow();expect(()=>validate('reminders.settings',{kind:'drink',snoozeMs:0})).toThrow();expect(validate('reminders.settings',{kind:'drink',snoozeMs:600000,schedule:{enabled:true,start:'22:00',end:'06:00'}}).snoozeMs).toBe(600000);});
