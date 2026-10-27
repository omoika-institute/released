import { memo } from 'preact/compat'

interface TextElement {
  id: string
  label: string
  value: string
}

export function Text({ id, label, value }: TextElement) {
  return (
    <div className='relative flex w-full border-l-2 border-l-review-border/30 bg-paper/20 px-2 py-1 text-primary-txt'>
      <p className='pr-2.5 font-display text-xs leading-5 text-primary-txt transition-colors duration-150 ease-out'>
        {value}{' '}
      </p>
    </div>
  )
}

export default memo(Text)
