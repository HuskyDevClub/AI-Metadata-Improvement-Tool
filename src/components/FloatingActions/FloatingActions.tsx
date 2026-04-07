import { useEffect, useState } from 'react';
import './FloatingActions.css';

export function FloatingActions() {
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 200);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!showScrollTop) return null;

    return (
        <div className="floating-actions">
            <button
                className="floating-actions-btn floating-actions-btn--top"
                onClick={scrollToTop}
                title="Scroll to top"
            >
                &uarr; Top
            </button>
        </div>
    );
}
