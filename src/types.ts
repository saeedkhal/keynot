export type EaseName = 'none' | 'easeIn' | 'easeOut' | 'easeInOut'

export type ObjectType = 'card' | 'arrow' | 'label'

export type SceneObject = {
  id: string
  type: ObjectType
  x: number
  y: number
  w: number
  h: number
  x2: number
  y2: number
  rotation: number
  opacity: number
  fill: string
  text: string
  textColor: string
  fontSize: number
  font: 'mono' | 'sans'
  radius: number
  stroke: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  roughness: number
  shadow: boolean
  locked: boolean
  textVAlign: 'center' | 'top'
  groupId: string | null
  points: { x: number; y: number }[]
  light: number
  startBound: string | null
  endBound: string | null
}

export type Transition = {
  duration: number
  delay: number
  ease: EaseName
  fadeUnmatched: boolean
}

export type Slide = {
  id: string
  name: string
  objects: SceneObject[]
  transition: Transition
}

export type Doc = {
  version: 1
  width: number
  height: number
  background: string
  slides: Slide[]
}

export type Guide = { axis: 'v' | 'h'; at: number }

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
