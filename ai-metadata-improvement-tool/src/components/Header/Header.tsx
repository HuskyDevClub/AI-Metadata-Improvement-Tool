import styles from './Header.module.css';

export function Header() {
    return (
        <div className={styles.header}>
            <h1>CSV Analyzer with Azure AI</h1>
            <p>Upload a CSV file or provide a URL, and let Azure AI generate intelligent descriptions</p>
            <p className={styles.credits}>
                Developed by <strong>The Four Musketeers</strong>: Danny Yue, Wynter Lin, Felix Zhao, Julia Zhu
            </p>
        </div>
    );
}
