import { useEffect, useRef, useState } from 'react';
import './InfoTooltip.css';

interface InfoTooltipProps {
    text: string;
    width?: string;
}

export function InfoTooltip({ text, width = '300px' }: InfoTooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Adjust position if tooltip goes off-screen
    useEffect(() => {
        if (isVisible && tooltipRef.current && containerRef.current) {
            const tooltipRect = tooltipRef.current.getBoundingClientRect();
            if (tooltipRect.right > window.innerWidth) {
                tooltipRef.current.style.left = 'auto';
                tooltipRef.current.style.right = '0';
                tooltipRef.current.style.transform = 'none';
            } else {
                tooltipRef.current.style.left = '50%';
                tooltipRef.current.style.right = 'auto';
                tooltipRef.current.style.transform = 'translateX(-50%)';
            }
        }
    }, [isVisible]);

    return (
        <div
            className="info-tooltip-container"
            ref={containerRef}
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            onFocus={() => setIsVisible(true)}
            onBlur={() => setIsVisible(false)}
            tabIndex={0}
        >
            <span className="info-tooltip-icon" aria-label="Information">?</span>
            {isVisible && (
                <div
                    className="info-tooltip-popup"
                    ref={tooltipRef}
                    style={{ width }}
                    role="tooltip"
                >
                    {text}
                </div>
            )}
        </div>
    );
}
