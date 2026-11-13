import type { ReactNode } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'

/** Whether a link points inside the app rather than at the API or another site. */
export function isAppLink(href: string | undefined): href is string {
  return !!href && href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/')
}

// A link into the app (a book page, another entry) navigates without reloading
// the app; anything else opens as a normal link.
export default function EntryLink({ href, children }: { href?: string; children?: ReactNode }) {
  const inRouter = useInRouterContext()
  if (inRouter && isAppLink(href)) return <Link to={href}>{children}</Link>
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}
