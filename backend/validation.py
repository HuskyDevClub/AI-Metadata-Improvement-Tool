"""
Validation engine for AI Metadata Improvement Tool.

This module implements a comprehensive validation system for Washington State
Open Data Portal compliance, including plain language requirements and
metadata quality checks.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, List, Optional
import re

from .models import ValidationIssue, ValidationResult, ValidationSeverity, ValidationCategory


class ValidationRule(ABC):
    """Base class for all validation rules."""

    def __init__(self, rule_id: str, category: ValidationCategory, severity: ValidationSeverity):
        self.rule_id = rule_id
        self.category = category
        self.severity = severity

    @abstractmethod
    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        """Validate the given data and return any issues found."""
        pass

    def _create_issue(self, message: str, field: Optional[str] = None,
                     suggestion: Optional[str] = None) -> ValidationIssue:
        """Helper to create a validation issue."""
        return ValidationIssue(
            rule_id=self.rule_id,
            category=self.category,
            severity=self.severity,
            field=field,
            message=message,
            suggestion=suggestion
        )


# Plain Language Rules

class AcronymExpansionRule(ValidationRule):
    """Ensures acronyms are expanded on first use."""

    def __init__(self):
        super().__init__(
            "acronym_expansion",
            ValidationCategory.PLAIN_LANGUAGE,
            ValidationSeverity.WARNING
        )

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []
        text = data.get('description', '') if field is None else data.get(field, '')

        # Common acronyms that should be expanded
        common_acronyms = {
            'API': 'Application Programming Interface',
            'CSV': 'Comma-Separated Values',
            'JSON': 'JavaScript Object Notation',
            'URL': 'Uniform Resource Locator',
            'WA': 'Washington',
            'US': 'United States'
        }

        for acronym, expansion in common_acronyms.items():
            if re.search(r'\b' + re.escape(acronym) + r'\b', text):
                # Check if expansion appears before acronym
                expansion_pattern = re.escape(expansion.split()[0])  # First word of expansion
                if not re.search(expansion_pattern, text.split(acronym)[0], re.IGNORECASE):
                    issues.append(self._create_issue(
                        f"Acronym '{acronym}' should be expanded to '{expansion}' on first use",
                        field=field,
                        suggestion=f"Add '{expansion} ({acronym})' on first occurrence"
                    ))

        return issues


class ActiveVoiceRule(ValidationRule):
    """Enforces use of active voice."""

    def __init__(self):
        super().__init__(
            "active_voice",
            ValidationCategory.PLAIN_LANGUAGE,
            ValidationSeverity.INFO
        )

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []
        text = data.get('description', '') if field is None else data.get(field, '')

        # Simple heuristic: look for passive voice indicators
        passive_indicators = [
            r'\b(is|are|was|were|be|been|being)\s+\w+ed\b',  # is/was + past participle
            r'\b(has|have|had)\s+been\s+\w+ed\b',  # has been + past participle
        ]

        for pattern in passive_indicators:
            if re.search(pattern, text, re.IGNORECASE):
                issues.append(self._create_issue(
                    "Consider using active voice instead of passive voice",
                    field=field,
                    suggestion="Rewrite in active voice (subject performs action)"
                ))
                break  # Only report once per field

        return issues


class SentenceLengthRule(ValidationRule):
    """Ensures sentences are under 20 words."""

    def __init__(self):
        super().__init__(
            "sentence_length",
            ValidationCategory.PLAIN_LANGUAGE,
            ValidationSeverity.WARNING
        )

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []
        text = data.get('description', '') if field is None else data.get(field, '')

        sentences = re.split(r'[.!?]+', text)
        for sentence in sentences:
            words = sentence.strip().split()
            if len(words) > 20:
                issues.append(self._create_issue(
                    f"Sentence is {len(words)} words long (limit: 20 words)",
                    field=field,
                    suggestion="Break long sentences into shorter ones"
                ))

        return issues


class FillerPhraseRule(ValidationRule):
    """Eliminates filler phrases."""

    def __init__(self):
        super().__init__(
            "filler_phrases",
            ValidationCategory.PLAIN_LANGUAGE,
            ValidationSeverity.INFO
        )

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []
        text = data.get('description', '') if field is None else data.get(field, '')

        filler_phrases = [
            "it should be noted that",
            "please note that",
            "it is important to",
            "as you can see",
            "in order to",
            "due to the fact that",
            "in the event that",
            "for the purpose of",
            "in terms of",
            "with regard to",
            "as far as",
            "in the case of"
        ]

        for phrase in filler_phrases:
            if phrase.lower() in text.lower():
                issues.append(self._create_issue(
                    f"Avoid filler phrase: '{phrase}'",
                    field=field,
                    suggestion="Use direct, concise language"
                ))

        return issues


# Content Rules

class RequiredFieldRule(ValidationRule):
    """Ensures required fields are present."""

    def __init__(self):
        super().__init__(
            "required_fields",
            ValidationCategory.REQUIRED,
            ValidationSeverity.CRITICAL
        )

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []

        required_fields = [
            'name', 'description', 'columns'
        ]

        for req_field in required_fields:
            if req_field not in data or not data[req_field]:
                issues.append(self._create_issue(
                    f"Required field '{req_field}' is missing or empty",
                    field=req_field,
                    suggestion="Provide a value for this required field"
                ))

        # Check columns have required fields
        if 'columns' in data and isinstance(data['columns'], list):
            for i, column in enumerate(data['columns']):
                if not isinstance(column, dict):
                    continue
                col_required = ['field_name', 'name', 'description', 'data_type']
                for req in col_required:
                    if req not in column or not column[req]:
                        issues.append(self._create_issue(
                            f"Column {i+1}: Required field '{req}' is missing or empty",
                            field=f"columns[{i}].{req}",
                            suggestion="Provide a value for this required column field"
                        ))

        return issues


class CompletenessRule(ValidationRule):
    """Checks for completeness of metadata."""

    def __init__(self):
        super().__init__(
            "completeness",
            ValidationCategory.CONTENT,
            ValidationSeverity.WARNING
        )

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []

        # Check for Washington State context
        description = data.get('description', '').lower()
        if 'washington' not in description and 'wa' not in description:
            issues.append(self._create_issue(
                "Description should include Washington State context",
                field='description',
                suggestion="Add reference to Washington State or specific agency"
            ))

        # Check for data source information
        if 'data_source' not in data or not data['data_source']:
            issues.append(self._create_issue(
                "Data source information is missing",
                field='data_source',
                suggestion="Specify where this data comes from"
            ))

        return issues


# Format Rules

class WordCountRule(ValidationRule):
    """Validates word count for descriptions."""

    def __init__(self, min_words: int, max_words: int, field_type: str):
        super().__init__(
            f"word_count_{field_type}",
            ValidationCategory.FORMAT,
            ValidationSeverity.WARNING
        )
        self.min_words = min_words
        self.max_words = max_words
        self.field_type = field_type

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []

        if self.field_type == 'dataset':
            text = data.get('description', '')
            if text:
                word_count = len(text.split())
                if word_count < self.min_words:
                    issues.append(self._create_issue(
                        f"Dataset description is too short ({word_count} words, minimum: {self.min_words})",
                        field='description',
                        suggestion="Add more detail to the dataset description"
                    ))
                elif word_count > self.max_words:
                    issues.append(self._create_issue(
                        f"Dataset description is too long ({word_count} words, maximum: {self.max_words})",
                        field='description',
                        suggestion="Shorten the dataset description"
                    ))

        elif self.field_type == 'column':
            if 'columns' in data and isinstance(data['columns'], list):
                for i, column in enumerate(data['columns']):
                    if isinstance(column, dict) and 'description' in column:
                        text = column['description']
                        word_count = len(text.split())
                        if word_count < self.min_words:
                            issues.append(self._create_issue(
                                f"Column '{column.get('name', f'Column {i+1}')}' description is too short ({word_count} words, minimum: {self.min_words})",
                                field=f"columns[{i}].description",
                                suggestion="Add more detail to the column description"
                            ))
                        elif word_count > self.max_words:
                            issues.append(self._create_issue(
                                f"Column '{column.get('name', f'Column {i+1}')}' description is too long ({word_count} words, maximum: {self.max_words})",
                                field=f"columns[{i}].description",
                                suggestion="Shorten the column description"
                            ))

        return issues


class SnakeCaseRule(ValidationRule):
    """Ensures field names use snake_case."""

    def __init__(self):
        super().__init__(
            "snake_case",
            ValidationCategory.FORMAT,
            ValidationSeverity.WARNING
        )

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []

        if 'columns' in data and isinstance(data['columns'], list):
            for i, column in enumerate(data['columns']):
                if isinstance(column, dict) and 'field_name' in column:
                    field_name = column['field_name']
                    if not re.match(r'^[a-z][a-z0-9_]*$', field_name):
                        issues.append(self._create_issue(
                            f"Field name '{field_name}' should use snake_case (lowercase with underscores)",
                            field=f"columns[{i}].field_name",
                            suggestion="Convert to snake_case format"
                        ))

        return issues


class DataTypeRule(ValidationRule):
    """Ensures data type information is included."""

    def __init__(self):
        super().__init__(
            "data_type_info",
            ValidationCategory.FORMAT,
            ValidationSeverity.INFO
        )

    def validate(self, data: Dict[str, Any], field: Optional[str] = None) -> List[ValidationIssue]:
        issues = []

        if 'columns' in data and isinstance(data['columns'], list):
            for i, column in enumerate(data['columns']):
                if isinstance(column, dict):
                    if 'data_type' not in column or not column['data_type']:
                        issues.append(self._create_issue(
                            f"Column '{column.get('name', f'Column {i+1}')}' is missing data type information",
                            field=f"columns[{i}].data_type",
                            suggestion="Specify the data type (e.g., text, number, date)"
                        ))

        return issues


class ValidationEngine:
    """Main validation engine that orchestrates all rules."""

    def __init__(self):
        self.rules = [
            # Plain language rules
            AcronymExpansionRule(),
            ActiveVoiceRule(),
            SentenceLengthRule(),
            FillerPhraseRule(),

            # Content rules
            RequiredFieldRule(),
            CompletenessRule(),

            # Format rules
            WordCountRule(80, 120, 'dataset'),
            WordCountRule(30, 60, 'column'),
            SnakeCaseRule(),
            DataTypeRule(),
        ]

    def validate_dataset(self, dataset: Dict[str, Any]) -> ValidationResult:
        """Validate a complete dataset metadata."""
        all_issues = []

        # Run all rules
        for rule in self.rules:
            issues = rule.validate(dataset)
            all_issues.extend(issues)

        # Calculate score based on issues
        critical_count = sum(1 for issue in all_issues if issue.severity == ValidationSeverity.CRITICAL)
        warning_count = sum(1 for issue in all_issues if issue.severity == ValidationSeverity.WARNING)
        info_count = sum(1 for issue in all_issues if issue.severity == ValidationSeverity.INFO)

        # Scoring: critical issues heavily penalize, warnings moderately, info lightly
        base_score = 100
        score = base_score - (critical_count * 20) - (warning_count * 5) - (info_count * 1)
        score = max(0, min(100, score))

        is_valid = critical_count == 0

        return ValidationResult(
            is_valid=is_valid,
            score=score,
            issues=all_issues,
            total_issues=len(all_issues),
            critical_count=critical_count,
            warning_count=warning_count,
            info_count=info_count
        )