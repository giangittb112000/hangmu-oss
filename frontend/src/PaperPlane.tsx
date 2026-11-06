export function PaperPlane({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M21.5 3.2 2.9 10.4c-.9.4-.9 1.6.1 1.9l4.6 1.4 1.8 5.6c.3.8 1.3 1 1.9.4l2.6-2.5 4.6 3.4c.7.5 1.7.1 1.9-.8l3-14.5c.2-1-.8-1.8-1.9-1.4Zm-4 4.1-7.4 6.7-.3 3.1-1.3-4.1 9-5.7Z"
        fill="currentColor"
      />
    </svg>
  )
}
