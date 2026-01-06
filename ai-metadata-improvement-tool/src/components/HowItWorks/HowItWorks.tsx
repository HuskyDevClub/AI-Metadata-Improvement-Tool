import { useState } from 'react';
import styles from './HowItWorks.module.css';

export function HowItWorks() {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className={styles.section}>
            <div className={styles.howItWorks}>
                <h3
                    className={`${styles.toggle} ${isCollapsed ? styles.collapsed : ''}`}
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    How It Works
                </h3>
                <div className={`${styles.content} ${isCollapsed ? styles.contentCollapsed : ''}`}>
                    <ol>
                        <li>
                            <strong>Upload Your Data:</strong> Choose a CSV file from your computer or provide a URL
                            to a hosted CSV file.
                        </li>
                        <li>
                            <strong>Automatic Analysis:</strong> The tool analyzes each column to determine its type
                            (numeric, categorical, or text) and calculates relevant statistics.
                        </li>
                        <li>
                            <strong>AI-Powered Descriptions:</strong> Azure OpenAI generates intelligent
                            descriptions:
                            <ul>
                                <li>
                                    A comprehensive <strong>dataset overview</strong> based on filename, column names,
                                    and statistics
                                </li>
                                <li>
                                    Individual <strong>column descriptions</strong> that explain what each field
                                    represents and its role in the dataset
                                </li>
                            </ul>
                        </li>
                        <li>
                            <strong>Customize Everything:</strong> Edit prompts before generation, modify
                            descriptions after they're created, or regenerate any description with one click.
                        </li>
                        <li>
                            <strong>Export Results:</strong> Download all descriptions as JSON for documentation or
                            further processing.
                        </li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
