import { clsx } from 'clsx'
import type React from 'react'
import modulestyles from './CodeBlockPlaceholder.module.css'
import styles from '../chat/ChatMessageContent/ChatMessageContent.module.css'

interface CodeBlockPlaceholderProps {
    text: string
    className?: string
}

/**
 * CodeBlockPlaceholder shows a shimmer loading animation when code is being generated
 * or checked by guardrails.
 */
export const CodeBlockPlaceholder: React.FC<CodeBlockPlaceholderProps> = ({
    text,
    className,
}: CodeBlockPlaceholderProps) => {
    const widths = text.split('\n').map(s => s.length)
    return (
        <div className={clsx(styles.content, 'tw-overflow-hidden tw-p-4', className)}>
            {/* TODO, integrate the generating, retry etc. notices */}
            {widths.map((width, index) => (
                <div
                    key={`${index}-${width}`}
                    className={clsx(
                        'tw-h-6 tw-my-2 tw-rounded',
                        modulestyles.line
                    )}
                    style={{
                        width: `${width}em`,
                    }}
                />
            ))}
        </div>
    )
}
