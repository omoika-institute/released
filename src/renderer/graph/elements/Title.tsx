import { memo } from 'preact/compat'

interface TitleProps {
  id: string
  label: string
  value: string
}

export function Title({ id, label, value }: TitleProps) {
  return (
    <div className='node-display !my-0 !py-0 border-l-2 border-l-review-border/40 bg-review-border/5 px-2 py-1'>
      {value && <h1 className='my-0 font-display text-sm uppercase tracking-[0.12em] text-primary-txt'>{value}</h1>}
    </div>
  )
}

export default memo(Title)
