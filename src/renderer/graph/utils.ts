import { Position } from '@xyflow/react'

const ENTITY_HANDLE_POSITIONS = [
  Position.Right,
  Position.Left,
  Position.Top,
  Position.Bottom,
]
const NODE_FRAME_INSET = 9

export const toSnakeCase = (string: string) => {
  if (string)
    return string
      .replace(/\W+/g, ' ')
      .split(/ /)
      .map((word) => word.toLowerCase())
      .join('_')
  return 'unknown'
}

// returns the position (top,right,bottom or right) passed node compared to
function getParams(nodeA, nodeB) {
  const centerA = getNodeCenter(nodeA)
  const centerB = getNodeCenter(nodeB)

  const horizontalDiff = Math.abs(centerA.x - centerB.x)
  const verticalDiff = Math.abs(centerA.y - centerB.y)

  let position

  // when the horizontal difference between the nodes is bigger, we use Position.Left or Position.Right for the handle
  if (horizontalDiff > verticalDiff) {
    position = centerA.x > centerB.x ? Position.Left : Position.Right
  } else {
    // here the vertical difference between the nodes is bigger, so we use Position.Top or Position.Bottom for the handle
    position = centerA.y > centerB.y ? Position.Top : Position.Bottom
  }

  const [x, y] = getHandleCoordsByPosition(nodeA, position)
  if (x == null || y == null) return null
  return [x, y, position]
}

function getHandleCoordsByPosition(node, handlePosition) {
  // all handles are from type source, that's why we use handleBounds.source here
  const handle = node.internals.handleBounds?.source?.find(
    (h) => h.position === handlePosition
  )

  if (!handle) {
    return [null, null]
  }

  let offsetX = handle.width / 2
  let offsetY = handle.height / 2

  // this is a tiny detail to make the markerEnd of an edge visible.
  // The handle position that gets calculated has the origin top-left, so depending which side we are using, we add a little offset
  // when the handlePosition is Position.Right for example, we need to add an offset as big as the handle itself in order to get the correct position
  switch (handlePosition) {
    case Position.Left:
      offsetX = 0
      break
    case Position.Right:
      offsetX = handle.width
      break
    case Position.Top:
      offsetY = 0
      break
    case Position.Bottom:
      offsetY = handle.height
      break
  }

  const x = node.internals.positionAbsolute.x + handle.x + offsetX
  const y = node.internals.positionAbsolute.y + handle.y + offsetY

  return [x, y]
}

function getNodeCenter(node) {
  const visualBounds = getVisualHandleBounds(node)
  if (visualBounds) {
    return {
      x: visualBounds.centerX,
      y: visualBounds.centerY,
    }
  }

  return {
    x: node.internals.positionAbsolute.x + node.measured.width / 2,
    y: node.internals.positionAbsolute.y + node.measured.height / 2,
  }
}

function getVisualHandleBounds(node) {
  const handles = node.internals.handleBounds?.source ?? []
  const left = handles.find((handle) => handle.position === Position.Left)
  const right = handles.find((handle) => handle.position === Position.Right)
  const top = handles.find((handle) => handle.position === Position.Top)
  const bottom = handles.find((handle) => handle.position === Position.Bottom)

  if (!left || !right || !top || !bottom) return null

  const [leftX] = getHandleCoordsByPosition(node, Position.Left)
  const [rightX] = getHandleCoordsByPosition(node, Position.Right)
  const [, topY] = getHandleCoordsByPosition(node, Position.Top)
  const [, bottomY] = getHandleCoordsByPosition(node, Position.Bottom)

  if (leftX == null || rightX == null || topY == null || bottomY == null) {
    return null
  }

  return {
    centerX: (leftX + rightX) / 2,
    centerY: (topY + bottomY) / 2,
    width: Math.max(Math.abs(rightX - leftX), 1),
    height: Math.max(Math.abs(bottomY - topY), 1),
  }
}

function getClosestHandleParams(node, point) {
  const handles = node.internals.handleBounds?.source ?? []
  let closest = null
  let closestDistance = Infinity

  for (const position of ENTITY_HANDLE_POSITIONS) {
    const handle = handles.find((candidate) => candidate.position === position)
    if (!handle) continue

    const [x, y] = getHandleCoordsByPosition(node, position)
    if (x == null || y == null) continue

    const dx = x - point.x
    const dy = y - point.y
    const distance = dx * dx + dy * dy

    if (distance < closestDistance) {
      closest = { x, y, position }
      closestDistance = distance
    }
  }

  if (closest) return closest

  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getFloatingSourceParams(node, point) {
  const bounds = getMeasuredNodeBounds(node, NODE_FRAME_INSET)
  const center = {
    x: bounds.centerX,
    y: bounds.centerY,
  }
  const width = bounds.width
  const height = bounds.height

  if (isCircularNode(node, width, height)) {
    return getCircularSourceParams(
      center,
      Math.max(Math.min(width, height) / 2, 1),
      point
    )
  }

  const halfWidth = Math.max(width / 2, 1)
  const halfHeight = Math.max(height / 2, 1)
  const left = center.x - halfWidth
  const right = center.x + halfWidth
  const top = center.y - halfHeight
  const bottom = center.y + halfHeight
  const isInside =
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom

  if (!isInside) {
    const x = clamp(point.x, left, right)
    const y = clamp(point.y, top, bottom)
    const outsideX =
      point.x < left ? left - point.x : point.x > right ? point.x - right : 0
    const outsideY =
      point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0
    let position = Position.Right

    if (outsideX > outsideY) {
      position = point.x < center.x ? Position.Left : Position.Right
    } else if (outsideY > 0) {
      position = point.y < center.y ? Position.Top : Position.Bottom
    }

    return { x, y, position }
  }

  const distances = [
    {
      distance: Math.abs(point.x - left),
      position: Position.Left,
      x: left,
      y: point.y,
    },
    {
      distance: Math.abs(point.x - right),
      position: Position.Right,
      x: right,
      y: point.y,
    },
    {
      distance: Math.abs(point.y - top),
      position: Position.Top,
      x: point.x,
      y: top,
    },
    {
      distance: Math.abs(point.y - bottom),
      position: Position.Bottom,
      x: point.x,
      y: bottom,
    },
  ]

  return distances.reduce((closest, candidate) =>
    candidate.distance < closest.distance ? candidate : closest
  )
}

function getMeasuredNodeBounds(node, inset = 0) {
  const x = node.internals.positionAbsolute.x + inset
  const y = node.internals.positionAbsolute.y + inset
  const width = Math.max((node.measured?.width ?? 1) - inset * 2, 1)
  const height = Math.max((node.measured?.height ?? 1) - inset * 2, 1)

  return {
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  }
}

function isCircularNode(node, width: number, height: number) {
  return node?.type === "view" && Math.abs(width - height) <= 2
}

function getCircularSourceParams(center, radius: number, point) {
  const dx = point.x - center.x
  const dy = point.y - center.y
  const length = Math.hypot(dx, dy) || 1
  const x = center.x + (dx / length) * radius
  const y = center.y + (dy / length) * radius
  const horizontal = Math.abs(dx) >= Math.abs(dy)

  return {
    x,
    y,
    position: horizontal
      ? dx < 0
        ? Position.Left
        : Position.Right
      : dy < 0
        ? Position.Top
        : Position.Bottom,
  }
}

// returns the parameters (sx, sy, tx, ty, sourcePos, targetPos) you need to create an edge
export function getEdgeParams(source, target) {
  const sourceParams = getParams(source, target)
  const targetParams = getParams(target, source)

  if (!sourceParams || !targetParams) return null

  const [sx, sy, sourcePos] = sourceParams
  const [tx, ty, targetPos] = targetParams

  return {
    sx,
    sy,
    tx,
    ty,
    sourcePos,
    targetPos,
  }
}

export function getFloatingEdgeParams(source, target) {
  const sourceCenter = getNodeCenter(source)
  const targetCenter = getNodeCenter(target)
  const sourceHandle = getClosestHandleParams(source, targetCenter)
  const targetHandle = getClosestHandleParams(target, sourceCenter)

  if (!sourceHandle || !targetHandle) return null

  return {
    sx: sourceHandle.x,
    sy: sourceHandle.y,
    tx: targetHandle.x,
    ty: targetHandle.y,
    sourcePos: sourceHandle.position,
    targetPos: targetHandle.position,
  }
}

export function getFloatingSourceToTargetHandleParams(source, target) {
  const targetCenter = getNodeCenter(target)
  const sourcePoint = getFloatingSourceParams(source, targetCenter)
  const targetHandle = getClosestHandleParams(target, sourcePoint)

  if (!sourcePoint || !targetHandle) return null

  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetHandle.x,
    ty: targetHandle.y,
    sourcePos: sourcePoint.position,
    targetPos: targetHandle.position,
  }
}
