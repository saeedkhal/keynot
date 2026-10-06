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
    fill: '#fffcf8',
    text,
    textColor: '#9a9388',
    font: 'sans',
    fontSize: 15,
    radius: 20,
    stroke: '#e6e1d8',
    strokeWidth: 1,
    shadow: false,
    locked: true,
    textVAlign: 'top',
  })
}

function card(id: string, x: number, y: number, fill: string, text: string): SceneObject {
  return baseObject({
    id,
    type: 'card',
    x,
    y,
    w: 190,
    h: 52,
    fill,
    text,
    font: 'mono',
    fontSize: 16,
    radius: 12,
    shadow: true,
    strokeWidth: 0,
  })
}

const regions = [region('region-stack', 40, 'call stack'), region('region-api', 345, 'web API'), region('region-queue', 650, 'callback queue')]

export function exampleDoc(): Doc {
  const traveling = [
    card('card-main', 80, 230, '#f3d36b', 'bar()'),
    card('card-main', 385, 230, '#8ecae6', 'bar()'),
    card('card-main', 690, 230, '#f4a261', 'bar()'),
    card('card-main', 80, 220, '#95d5b2', 'bar()'),
  ]
  const names = ['Stack', 'Web API', 'Queue', 'Back on the stack']
  return {
    version: 1,
    width: 960,
    height: 540,
    background: '#f6f3ee',
    slides: traveling.map((main, index) => ({
      id: uid(),
      name: names[index],
      transition: defaultTransition(),
      objects: index === 3 ? [...regions.map((item) => ({ ...item })), main, card('card-log', 80, 292, '#f28482', '() => "Hey"')] : [...regions.map((item) => ({ ...item })), main],
    })),
  }
}
