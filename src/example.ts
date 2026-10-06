import { baseObject, defaultTransition, uid } from './doc'
import type { Doc, SceneObject } from './types'

function region(id: string, x: number, text: string): SceneObject {
  return baseObject({
    id,
    type: 'card',
    x,
    y: 36,
    w: 270,
    h: 468,
    fill: 'transparent',
    text,
    textColor: '#f8f9fa',
    font: 'sans',
    fontSize: 20,
    radius: 16,
    stroke: '#e9ecef',
    strokeWidth: 1.5,
    shadow: false,
    locked: true,
    textVAlign: 'top',
  })
}

function card(id: string, x: number, y: number, text: string): SceneObject {
  return baseObject({
    id,
    type: 'card',
    x,
    y,
    w: 190,
    h: 52,
    fill: 'transparent',
    text,
    textColor: '#f8f9fa',
    font: 'sans',
    fontSize: 20,
    radius: 10,
    stroke: '#e9ecef',
    strokeWidth: 1.5,
    shadow: false,
  })
}

const regions = [region('region-stack', 40, 'call stack'), region('region-api', 345, 'web API'), region('region-queue', 650, 'callback queue')]

export function exampleDoc(): Doc {
  const traveling = [
    card('card-main', 80, 230, 'bar()'),
    card('card-main', 385, 230, 'bar()'),
    card('card-main', 690, 230, 'bar()'),
    card('card-main', 80, 220, 'bar()'),
  ]
  const names = ['Stack', 'Web API', 'Queue', 'Back on the stack']
  return {
    version: 1,
    width: 960,
    height: 540,
    background: '#000000',
    slides: traveling.map((main, index) => ({
      id: uid(),
      name: names[index],
      transition: defaultTransition(),
      objects: index === 3 ? [...regions.map((item) => ({ ...item })), main, card('card-log', 80, 292, '() => "Hey"')] : [...regions.map((item) => ({ ...item })), main],
    })),
  }
}
